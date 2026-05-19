import Foundation
import BackgroundTasks
import UIKit

/**
 * BGTaskManager
 *
 * Wraps iOS background execution APIs:
 *
 *  1. UIApplication.beginBackgroundTask  — up to ~30s of execution after backgrounding.
 *     Used for all timers as the immediate safety net.
 *
 *  2. BGProcessingTask (BGTaskScheduler) — iOS 13+. Used for timers > 30s.
 *     Fires when iOS decides to wake the app (usually on charge, wifi, etc.)
 *     Not guaranteed to fire at the exact time, but will fire before the deadline.
 *
 * Strategy:
 *  - On startTimer: begin a UIBackgroundTask + schedule a BGProcessingTask
 *  - The UIBackgroundTask keeps us alive for ~30s
 *  - The BGProcessingTask is our long-term safety net
 *  - If timer completes within 30s: end the UIBackgroundTask normally
 *  - If timer takes longer: the BGProcessingTask wakes us up to finish
 *
 * Limitation: iOS background execution is best-effort. If the user force-kills
 * the app, the timer stops. The persisted state (TimerStore) handles this —
 * on next launch, JS can check getPersistedTimers() to see what happened.
 */
final class BGTaskManager {

  // ── BGTask identifiers ─────────────────────────────────────────────────────
  // Must be registered in Info.plist under BGTaskSchedulerPermittedIdentifiers

  private static let processingTaskId = "com.rick427.backgroundtimer.processing"

  // ── State ──────────────────────────────────────────────────────────────────

  /// Active UIApplication background task tokens (one per timer)
  private var bgTaskIds: [String: UIBackgroundTaskIdentifier] = [:]

  /// Active BGProcessingTasks (one per timer for long-running ones)
  private var processingTasks: [String: BGTask] = [:]

  /// Callbacks to invoke when a BGProcessingTask fires
  private var processingCallbacks: [String: () -> Void] = [:]

  private let lock = NSLock()

  // ── Singleton ──────────────────────────────────────────────────────────────

  static let shared = BGTaskManager()

  private init() {
    registerBGTasks()
  }

  // ── Registration (called once at init) ────────────────────────────────────

  private func registerBGTasks() {
    BGTaskScheduler.shared.register(
      forTaskWithIdentifier: Self.processingTaskId,
      using: nil
    ) { [weak self] task in
      guard let processingTask = task as? BGProcessingTask else { return }
      self?.handleProcessingTask(processingTask)
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Begin background execution for a timer.
   * Call this when startTimer() is called and the app may be going to background.
   *
   * @param timerId  The timer's string ID
   * @param deadline When the timer is expected to complete (epoch seconds)
   * @param onExpire Called if iOS terminates background execution before completion
   */
  func beginBackgroundExecution(
    timerId: String,
    deadline: Date,
    onExpire: @escaping () -> Void
  ) {
    // ── 1. UIBackgroundTask (immediate ~30s safety net) ─────────────────────
    let bgTaskId = UIApplication.shared.beginBackgroundTask(withName: "BGTimer.\(timerId)") {
      // Expiration handler: iOS is about to suspend us
      onExpire()
      self.endBackgroundExecution(timerId: timerId)
    }

    lock.lock()
    bgTaskIds[timerId] = bgTaskId
    lock.unlock()

    // ── 2. BGProcessingTask (for timers that outlast the 30s window) ────────
    let timeUntilDeadline = deadline.timeIntervalSinceNow
    if timeUntilDeadline > 25 {  // only bother if timer is > 25s from now
      scheduleBGProcessingTask(timerId: timerId, deadline: deadline, onExpire: onExpire)
    }
  }

  /**
   * End background execution for a timer.
   * Call this when the timer completes, is stopped, or is destroyed.
   */
  func endBackgroundExecution(timerId: String) {
    lock.lock()
    let bgTaskId = bgTaskIds.removeValue(forKey: timerId)
    processingCallbacks.removeValue(forKey: timerId)
    lock.unlock()

    if let id = bgTaskId, id != .invalid {
      UIApplication.shared.endBackgroundTask(id)
    }

    // Cancel the BGProcessingTask if it hasn't fired yet
    BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.processingTaskId)
  }

  // ── BGProcessingTask scheduling ────────────────────────────────────────────

  private func scheduleBGProcessingTask(
    timerId: String,
    deadline: Date,
    onExpire: @escaping () -> Void
  ) {
    let request = BGProcessingTaskRequest(identifier: Self.processingTaskId)
    // Schedule slightly before the deadline so we have time to process
    request.earliestBeginDate = deadline.addingTimeInterval(-5)
    request.requiresNetworkConnectivity = false
    request.requiresExternalPower = false

    lock.lock()
    processingCallbacks[timerId] = onExpire
    lock.unlock()

    do {
      try BGTaskScheduler.shared.submit(request)
    } catch {
      // BGTaskScheduler may reject if BGTaskSchedulerPermittedIdentifiers not set up
      // App still works — just loses the long-term wakeup guarantee
      NSLog("[BGTimerManager] Failed to schedule BGProcessingTask: \(error)")
    }
  }

  private func handleProcessingTask(_ task: BGProcessingTask) {
    // iOS woke us up — run all registered callbacks
    task.expirationHandler = {
      // iOS is giving us the last chance — we'll end gracefully
      task.setTaskCompleted(success: false)
    }

    lock.lock()
    let callbacks = processingCallbacks
    lock.unlock()

    callbacks.values.forEach { $0() }
    task.setTaskCompleted(success: true)
  }
}
