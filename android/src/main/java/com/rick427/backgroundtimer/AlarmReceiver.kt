package com.rick427.backgroundtimer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * AlarmReceiver
 *
 * BroadcastReceiver that catches AlarmManager broadcasts.
 * Runs in the main process — forwards the alarm to BackgroundTimerService.
 *
 * Registered in AndroidManifest.xml with exported=false so only our
 * AlarmManager PendingIntents can trigger it.
 */
class AlarmReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != BackgroundTimerService.ACTION_ALARM) return

    val timerId = intent.getStringExtra(BackgroundTimerService.EXTRA_TIMER_ID)
    if (timerId == null) {
      Log.w(TAG, "AlarmReceiver: missing timer ID")
      return
    }

    Log.d(TAG, "Alarm received for timer: $timerId")

    // Forward to the service — it manages all timer state
    val serviceIntent = Intent(context, BackgroundTimerService::class.java).apply {
      action = BackgroundTimerService.ACTION_ALARM
      putExtra(BackgroundTimerService.EXTRA_TIMER_ID, timerId)
    }

    // Use startForegroundService on API 26+ since the service may not be bound
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
      context.startForegroundService(serviceIntent)
    } else {
      context.startService(serviceIntent)
    }
  }

  companion object {
    private const val TAG = "BGTimerAlarmReceiver"
  }
}
