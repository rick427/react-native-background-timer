import Foundation
import React

/**
 * RNBackgroundTimer
 *
 * iOS Turbo Module implementation for @rick427/background-timer.
 * Bridges JS calls to native timer management + BGTaskManager.
 *
 * Threading: All timer state mutations happen on a dedicated serial queue
 * (`timerQueue`) to avoid race conditions. Event emission is dispatched
 * back to the main queue.
 */
@objc(RNBackgroundTimer)
class RNBackgroundTimer: RCTEventEmitter {

  // ── State ──────────────────────────────────────────────────────────────────

  private var timers: [String: TimerData] = [:]
  private var tickTimers: [String: Timer] = [:]   // DispatchSourceTimer per timer
  private var store = TimerStore()
  private let timerQueue = DispatchQueue(label: "com.rick427.backgroundtimer.queue")
  private var hasListeners = false

  // ── Legacy state ───────────────────────────────────────────────────────────
  private var legacyIdCounter: Int = 0

  // ── RCTEventEmitter ────────────────────────────────────────────────────────

  override static func requiresMainQueueSetup() -> Bool { false }

  override func supportedEvents() -> [String]! {
    return [
      "BGTimer.tick",
      "BGTimer.complete",
      "BGTimer.error",
      "BGTimer.stateChange",
      "BGTimer.legacy.timeout",
      "BGTimer.legacy.tick",
    ]
  }

  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  // ── Timer Lifecycle ────────────────────────────────────────────────────────

  @objc func createTimer(
    _ id: String,
    duration: Double,
    tickInterval: Double,
    persist: Bool,
    androidConfig: String,   // ignored on iOS
    iosTaskIdentifier: String
  ) {
    timerQueue.async { [weak self] in
      guard let self else { return }
      let data = TimerData(
        id: id,
        duration: duration,
        tickInterval: tickInterval,
        persist: persist,
        iosTaskIdentifier: iosTaskIdentifier
      )
      self.timers[id] = data
      if persist { self.store.save(data) }
    }
  }

  @objc func startTimer(_ id: String) {
    timerQueue.async { [weak self] in
      guard let self, var timer = self.timers[id] else {
        self?.emitError(id: id, code: "TIMER_NOT_FOUND", message: "Timer '\(id)' not found")
        return
      }
      guard timer.timerStatus != .running else {
        self.emitError(id: id, code: "ALREADY_RUNNING", message: "Timer '\(id)' is already running")
        return
      }

      let now = Date().timeIntervalSince1970 * 1000  // epoch ms
      timer.status = TimerStatus.running.stringValue
      timer.startedAt = timer.startedAt == 0 ? now : timer.startedAt
      timer.pausedAt = 0

      self.timers[id] = timer
      self.store.save(timer)

      // Begin background execution
      let deadlineDate = Date(timeIntervalSinceNow: timer.remaining / 1000.0)
      BGTaskManager.shared.beginBackgroundExecution(
        timerId: id,
        deadline: deadlineDate
      ) { [weak self] in
        // iOS is about to suspend — emit error so JS can handle
        self?.emitError(id: id, code: "TASK_EXPIRED",
                        message: "iOS terminated background execution for timer '\(id)' before it completed")
      }

      self.startTickTimer(for: timer)
      self.emitStateChange(id: id)
    }
  }

  @objc func pauseTimer(_ id: String) {
    timerQueue.async { [weak self] in
      guard let self, var timer = self.timers[id], timer.timerStatus == .running else { return }

      let now = Date().timeIntervalSince1970 * 1000
      self.stopTickTimer(id: id)

      // Compute elapsed using wall clock for accuracy
      let elapsed = timer.elapsed + (now - (timer.startedAt > 0 ? timer.startedAt : now))
      timer.elapsed = min(elapsed, timer.duration)
      timer.remaining = max(timer.duration - timer.elapsed, 0)
      timer.status = TimerStatus.paused.stringValue
      timer.pausedAt = now

      self.timers[id] = timer
      self.store.save(timer)
      BGTaskManager.shared.endBackgroundExecution(timerId: id)
      self.emitStateChange(id: id)
    }
  }

  @objc func resumeTimer(_ id: String) {
    timerQueue.async { [weak self] in
      guard let self, var timer = self.timers[id], timer.timerStatus == .paused else { return }

      let now = Date().timeIntervalSince1970 * 1000
      timer.status = TimerStatus.running.stringValue
      timer.startedAt = now - timer.elapsed   // back-calculate start so elapsed stays correct
      timer.pausedAt = 0
      self.timers[id] = timer
      self.store.save(timer)

      let deadlineDate = Date(timeIntervalSinceNow: timer.remaining / 1000.0)
      BGTaskManager.shared.beginBackgroundExecution(timerId: id, deadline: deadlineDate) { [weak self] in
        self?.emitError(id: id, code: "TASK_EXPIRED",
                        message: "iOS terminated background execution for timer '\(id)'")
      }

      self.startTickTimer(for: timer)
      self.emitStateChange(id: id)
    }
  }

  @objc func stopTimer(_ id: String) {
    timerQueue.async { [weak self] in
      guard let self, var timer = self.timers[id] else { return }

      self.stopTickTimer(id: id)
      BGTaskManager.shared.endBackgroundExecution(timerId: id)

      timer.status = TimerStatus.stopped.stringValue
      timer.elapsed = 0
      timer.remaining = timer.duration
      timer.startedAt = 0
      timer.pausedAt = 0
      self.timers[id] = timer
      self.store.save(timer)
      self.emitStateChange(id: id)
    }
  }

  @objc func resetTimer(_ id: String) {
    timerQueue.async { [weak self] in
      guard let self, var timer = self.timers[id] else { return }

      let wasRunning = timer.timerStatus == .running
      self.stopTickTimer(id: id)

      let now = Date().timeIntervalSince1970 * 1000
      timer.elapsed = 0
      timer.remaining = timer.duration
      timer.startedAt = wasRunning ? now : 0
      timer.pausedAt = 0
      self.timers[id] = timer
      self.store.save(timer)

      if wasRunning { self.startTickTimer(for: timer) }
      self.emitStateChange(id: id)
    }
  }

  @objc func destroyTimer(_ id: String) {
    timerQueue.async { [weak self] in
      guard let self else { return }
      self.stopTickTimer(id: id)
      BGTaskManager.shared.endBackgroundExecution(timerId: id)
      self.timers.removeValue(forKey: id)
      self.store.delete(id: id)
    }
  }

  // ── State queries ──────────────────────────────────────────────────────────

  @objc func getTimerState(_ id: String) -> [String: Any] {
    return timerQueue.sync {
      timers[id]?.toRNMap() ?? emptyTimerMap(id: id)
    }
  }

  @objc func getPersistedTimers() -> [[String: Any]] {
    return store.loadAll().map { $0.toRNMap() }
  }

  // ── Permissions ────────────────────────────────────────────────────────────

  @objc func canScheduleExactAlarms() -> Bool { true }   // iOS doesn't need this
  @objc func requestExactAlarmPermission() {}             // No-op on iOS

  // ── Legacy API ─────────────────────────────────────────────────────────────

  @objc func legacySetTimeout(_ callbackId: Double, delay: Double) {
    let id = "legacy-timeout-\(Int(callbackId))"
    createTimer(id, duration: delay, tickInterval: 0, persist: false,
                androidConfig: "", iosTaskIdentifier: "")

    timerQueue.async { [weak self] in
      guard let self, var timer = self.timers[id] else { return }
      timer.status = TimerStatus.running.stringValue
      timer.startedAt = Date().timeIntervalSince1970 * 1000
      self.timers[id] = timer

      // Use GCD for legacy one-shot timers
      DispatchQueue.main.asyncAfter(deadline: .now() + delay / 1000.0) { [weak self] in
        guard let self, self.timers[id] != nil else { return }
        self.emit("BGTimer.legacy.timeout", body: ["callbackId": Int(callbackId)])
        self.timers.removeValue(forKey: id)
      }
    }
  }

  @objc func legacySetInterval(_ callbackId: Double, interval: Double) {
    let id = "legacy-interval-\(Int(callbackId))"
    let intervalSeconds = interval / 1000.0

    timerQueue.async { [weak self] in
      guard let self else { return }
      var timer = TimerData(id: id, duration: Double.infinity, tickInterval: interval, persist: false)
      timer.status = TimerStatus.running.stringValue
      self.timers[id] = timer

      // Use a repeating Timer on the main run loop
      DispatchQueue.main.async {
        let t = Timer.scheduledTimer(withTimeInterval: intervalSeconds, repeats: true) { [weak self] _ in
          guard let self, self.timers[id] != nil else { return }
          self.emit("BGTimer.legacy.tick", body: ["callbackId": Int(callbackId)])
        }
        self.tickTimers[id] = t
      }
    }
  }

  @objc func legacyClear(_ callbackId: Double) {
    let timeoutId = "legacy-timeout-\(Int(callbackId))"
    let intervalId = "legacy-interval-\(Int(callbackId))"
    timerQueue.async { [weak self] in
      self?.stopTickTimer(id: timeoutId)
      self?.stopTickTimer(id: intervalId)
      self?.timers.removeValue(forKey: timeoutId)
      self?.timers.removeValue(forKey: intervalId)
    }
  }

  // ── Tick timer management ─────────────────────────────────────────────────

  private func startTickTimer(for timer: TimerData) {
    stopTickTimer(id: timer.id)  // cancel any existing

    let intervalSeconds = timer.tickInterval > 0
      ? timer.tickInterval / 1000.0
      : timer.remaining / 1000.0    // fire once at the end if no tick interval

    let timerId = timer.id

    DispatchQueue.main.async { [weak self] in
      let t = Timer.scheduledTimer(withTimeInterval: intervalSeconds, repeats: timer.tickInterval > 0) { [weak self] _ in
        self?.onTick(timerId: timerId)
      }
      // Schedule on the run loop so it fires when app is backgrounded
      RunLoop.main.add(t, forMode: .common)
      self?.timerQueue.async {
        self?.tickTimers[timerId] = t
      }
    }
  }

  private func stopTickTimer(id: String) {
    DispatchQueue.main.async { [weak self] in
      self?.tickTimers[id]?.invalidate()
      self?.timerQueue.async {
        self?.tickTimers.removeValue(forKey: id)
      }
    }
  }

  private func onTick(timerId: String) {
    timerQueue.async { [weak self] in
      guard let self, var timer = self.timers[timerId],
            timer.timerStatus == .running else { return }

      let now = Date().timeIntervalSince1970 * 1000
      // Wall-clock drift correction
      let elapsed = now - timer.startedAt
      let newElapsed = min(elapsed, timer.duration)
      let newRemaining = max(timer.duration - newElapsed, 0)

      if newRemaining <= 0 {
        // ── Complete ─────────────────────────────────────────────────────
        self.stopTickTimer(id: timerId)
        timer.status = TimerStatus.completed.stringValue
        timer.elapsed = timer.duration
        timer.remaining = 0
        timer.completedAt = now
        self.timers[timerId] = timer
        self.store.save(timer)
        BGTaskManager.shared.endBackgroundExecution(timerId: timerId)
        self.emitComplete(id: timerId)
      } else {
        // ── Tick ─────────────────────────────────────────────────────────
        timer.elapsed = newElapsed
        timer.remaining = newRemaining
        self.timers[timerId] = timer
        self.store.save(timer)
        self.emitTick(id: timerId, elapsed: newElapsed, remaining: newRemaining)
      }
    }
  }

  // ── Event emission ─────────────────────────────────────────────────────────

  private func emitTick(id: String, elapsed: Double, remaining: Double) {
    emit("BGTimer.tick", body: ["id": id, "elapsed": elapsed, "remaining": remaining])
  }

  private func emitComplete(id: String) {
    emit("BGTimer.complete", body: ["id": id])
  }

  private func emitStateChange(id: String) {
    emit("BGTimer.stateChange", body: ["id": id])
  }

  private func emitError(id: String, code: String, message: String) {
    emit("BGTimer.error", body: [
      "id": id,
      "error": ["code": code, "message": message, "timerId": id]
    ])
  }

  private func emit(_ eventName: String, body: [String: Any]) {
    guard hasListeners else { return }
    sendEvent(withName: eventName, body: body)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private func emptyTimerMap(id: String) -> [String: Any] {
    return [
      "id": id, "status": "idle",
      "duration": 0, "elapsed": 0, "remaining": 0,
      "startedAt": 0, "completedAt": 0, "pausedAt": 0,
    ]
  }
}
