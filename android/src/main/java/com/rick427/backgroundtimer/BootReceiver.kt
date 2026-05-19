package com.rick427.backgroundtimer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BootReceiver
 *
 * Restores any persisted, in-progress timers after a device reboot.
 *
 * Required permissions in AndroidManifest.xml:
 *   <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
 *
 * For timers that were RUNNING when the device rebooted:
 *  - We check how much time has elapsed since the timer's startedAt
 *  - If the timer would have already completed, we mark it COMPLETED
 *  - If time is still remaining, we resume it from the correct offset
 *
 * Note: The app process is not started by this receiver. State is restored
 * lazily when the app launches next (via BackgroundTimerModule.getPersistedTimers).
 * This receiver only updates the persisted state on disk for accuracy.
 */
class BootReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
      intent.action != "android.intent.action.QUICKBOOT_POWERON"
    ) return

    Log.d(TAG, "Boot completed — reconciling persisted timers")

    val store = TimerStore(context)
    val now = System.currentTimeMillis()

    store.loadAll()
      .filter { it.status == TimerStatus.RUNNING }
      .forEach { timer ->
        val elapsedSinceStart = now - timer.startedAt
        val totalElapsed = timer.elapsed + elapsedSinceStart
        val newRemaining = (timer.duration - totalElapsed).coerceAtLeast(0)

        val updated = if (newRemaining <= 0) {
          // Timer completed while device was off
          timer.copy(
            status = TimerStatus.COMPLETED,
            elapsed = timer.duration,
            remaining = 0,
            completedAt = timer.startedAt + timer.duration,
          )
        } else {
          // Timer still has time remaining — update elapsed/remaining offsets
          timer.copy(
            elapsed = totalElapsed,
            remaining = newRemaining,
            // Reset startedAt to now so the module can resume from here
            startedAt = now,
          )
        }

        store.save(updated)
        Log.d(TAG, "Timer ${timer.id} reconciled: status=${updated.status}, remaining=${updated.remaining}ms")
      }
  }

  companion object {
    private const val TAG = "BGTimerBootReceiver"
  }
}
