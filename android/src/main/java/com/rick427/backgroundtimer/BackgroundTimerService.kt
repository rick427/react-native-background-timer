package com.rick427.backgroundtimer

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject

/**
 * BackgroundTimerService
 *
 * A bound + started Foreground Service that:
 *  - Keeps the app process alive on Android 8+ by displaying a notification
 *  - Holds a PARTIAL_WAKE_LOCK so the CPU stays awake
 *  - Uses AlarmManager.setExactAndAllowWhileIdle() to fire through Doze mode
 *  - Emits React Native events (tick, complete, stateChange, error) back to JS
 *
 * Lifecycle:
 *   startTimer → scheduleAlarm (AlarmManager) → AlarmReceiver fires → onAlarm()
 *   → emit tick → reschedule OR emit complete → stopSelf
 */
class BackgroundTimerService : Service() {

  // ── State ──────────────────────────────────────────────────────────────────

  // All active timers managed by this service
  private val timers = mutableMapOf<String, TimerData>()

  // Wall-clock time when each timer last ticked (for drift correction)
  private val lastTickWallTime = mutableMapOf<String, Long>()

  private lateinit var store: TimerStore
  private lateinit var alarmManager: AlarmManager
  private var wakeLock: PowerManager.WakeLock? = null
  private var reactContext: ReactApplicationContext? = null

  // ── Binder (so the Module can bind to us) ─────────────────────────────────

  inner class LocalBinder : Binder() {
    fun getService(): BackgroundTimerService = this@BackgroundTimerService
  }

  private val binder = LocalBinder()

  override fun onBind(intent: Intent?): IBinder = binder

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  override fun onCreate() {
    super.onCreate()
    store = TimerStore(applicationContext)
    alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager

    val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = powerManager.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      "RNBackgroundTimer::WakeLock"
    )

    Log.d(TAG, "BackgroundTimerService created")
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_ALARM -> {
        val timerId = intent.getStringExtra(EXTRA_TIMER_ID) ?: return START_NOT_STICKY
        onAlarm(timerId)
      }
    }
    return START_STICKY // restart if killed by OS
  }

  override fun onDestroy() {
    super.onDestroy()
    releaseWakeLock()
    Log.d(TAG, "BackgroundTimerService destroyed")
  }

  // ── Public API (called by BackgroundTimerModule via binder) ───────────────

  fun setReactContext(context: ReactApplicationContext) {
    reactContext = context
  }

  fun createTimer(data: TimerData) {
    timers[data.id] = data
    if (data.persist) store.save(data)
    Log.d(TAG, "Timer created: ${data.id}")
  }

  fun startTimer(id: String) {
    val timer = timers[id] ?: run {
      emitError(id, "TIMER_NOT_FOUND", "Timer '$id' not found")
      return
    }

    if (timer.status == TimerStatus.RUNNING) {
      emitError(id, "ALREADY_RUNNING", "Timer '$id' is already running")
      return
    }

    val now = System.currentTimeMillis()
    val updated = timer.copy(
      status = TimerStatus.RUNNING,
      startedAt = if (timer.startedAt == 0L) now else timer.startedAt,
      pausedAt = 0L,
    )
    timers[id] = updated
    lastTickWallTime[id] = now
    store.save(updated)

    // Promote to foreground service with notification on first timer start
    if (timers.values.count { it.status == TimerStatus.RUNNING } == 1) {
      promoteToForeground(updated.androidConfig)
    }

    acquireWakeLock()
    scheduleAlarm(updated)
    emitStateChange(id)

    Log.d(TAG, "Timer started: $id, remaining: ${updated.remaining}ms")
  }

  fun pauseTimer(id: String) {
    val timer = timers[id] ?: return
    if (timer.status != TimerStatus.RUNNING) return

    val now = System.currentTimeMillis()
    cancelAlarm(id)

    // Compute elapsed since last tick
    val wallElapsed = now - (lastTickWallTime[id] ?: now)
    val newElapsed = (timer.elapsed + wallElapsed).coerceAtMost(timer.duration)

    val updated = timer.copy(
      status = TimerStatus.PAUSED,
      elapsed = newElapsed,
      remaining = (timer.duration - newElapsed).coerceAtLeast(0),
      pausedAt = now,
    )
    timers[id] = updated
    store.save(updated)
    emitStateChange(id)

    // Release wake lock if no more running timers
    if (timers.values.none { it.status == TimerStatus.RUNNING }) {
      releaseWakeLock()
    }

    Log.d(TAG, "Timer paused: $id, elapsed: ${updated.elapsed}ms")
  }

  fun resumeTimer(id: String) {
    val timer = timers[id] ?: return
    if (timer.status != TimerStatus.PAUSED) return

    val now = System.currentTimeMillis()
    val updated = timer.copy(
      status = TimerStatus.RUNNING,
      pausedAt = 0L,
    )
    timers[id] = updated
    lastTickWallTime[id] = now
    store.save(updated)

    acquireWakeLock()
    scheduleAlarm(updated)
    emitStateChange(id)

    Log.d(TAG, "Timer resumed: $id, remaining: ${updated.remaining}ms")
  }

  fun stopTimer(id: String) {
    val timer = timers[id] ?: return
    cancelAlarm(id)

    val updated = timer.copy(
      status = TimerStatus.STOPPED,
      elapsed = 0,
      remaining = timer.duration,
      startedAt = 0L,
      pausedAt = 0L,
    )
    timers[id] = updated
    lastTickWallTime.remove(id)
    store.save(updated)
    emitStateChange(id)
    checkAndDemoteService()

    Log.d(TAG, "Timer stopped: $id")
  }

  fun resetTimer(id: String) {
    val timer = timers[id] ?: return
    cancelAlarm(id)

    val wasRunning = timer.status == TimerStatus.RUNNING
    val now = System.currentTimeMillis()

    val updated = timer.copy(
      elapsed = 0,
      remaining = timer.duration,
      startedAt = if (wasRunning) now else 0L,
      pausedAt = 0L,
    )
    timers[id] = updated
    lastTickWallTime[id] = now
    store.save(updated)

    if (wasRunning) scheduleAlarm(updated)
    emitStateChange(id)

    Log.d(TAG, "Timer reset: $id")
  }

  fun destroyTimer(id: String) {
    cancelAlarm(id)
    timers.remove(id)
    lastTickWallTime.remove(id)
    store.delete(id)
    checkAndDemoteService()

    Log.d(TAG, "Timer destroyed: $id")
  }

  fun getTimerState(id: String): TimerData? = timers[id]

  fun getAllTimers(): List<TimerData> = timers.values.toList()

  // ── AlarmManager scheduling ────────────────────────────────────────────────

  /**
   * Schedules the next alarm tick. Uses:
   *  - setExactAndAllowWhileIdle() → fires even in Doze mode
   *  - Schedules the sooner of: tickInterval OR remaining time
   */
  private fun scheduleAlarm(timer: TimerData) {
    val interval = if (timer.tickInterval > 0) timer.tickInterval else timer.remaining
    val delay = interval.coerceAtMost(timer.remaining)
    val triggerAt = System.currentTimeMillis() + delay

    val intent = Intent(applicationContext, AlarmReceiver::class.java).apply {
      action = ACTION_ALARM
      putExtra(EXTRA_TIMER_ID, timer.id)
    }

    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val pendingIntent = PendingIntent.getBroadcast(
      applicationContext, timerRequestCode(timer.id), intent, flags
    )

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
      !alarmManager.canScheduleExactAlarms()
    ) {
      // Exact alarms not permitted — fall back to inexact (still fires through Doze)
      alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
      Log.w(TAG, "Exact alarms not permitted, using inexact alarm for ${timer.id}")
    } else {
      alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
    }

    Log.d(TAG, "Alarm scheduled for ${timer.id} in ${delay}ms")
  }

  private fun cancelAlarm(id: String) {
    val intent = Intent(applicationContext, AlarmReceiver::class.java).apply {
      action = ACTION_ALARM
    }
    val flags = PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
    val pendingIntent = PendingIntent.getBroadcast(
      applicationContext, timerRequestCode(id), intent, flags
    )
    pendingIntent?.let { alarmManager.cancel(it) }
  }

  // ── Called by AlarmReceiver ────────────────────────────────────────────────

  fun onAlarm(timerId: String) {
    val timer = timers[timerId]
    if (timer == null || timer.status != TimerStatus.RUNNING) return

    val now = System.currentTimeMillis()

    // Drift correction: use wall clock delta instead of trusting alarm timing
    val wallDelta = now - (lastTickWallTime[timerId] ?: now)
    lastTickWallTime[timerId] = now

    val newElapsed = (timer.elapsed + wallDelta).coerceAtMost(timer.duration)
    val newRemaining = (timer.duration - newElapsed).coerceAtLeast(0)

    if (newRemaining <= 0) {
      // ── Timer complete ──────────────────────────────────────────────────
      val completed = timer.copy(
        status = TimerStatus.COMPLETED,
        elapsed = timer.duration,
        remaining = 0,
        completedAt = now,
      )
      timers[timerId] = completed
      store.save(completed)
      emitComplete(timerId)
      checkAndDemoteService()

      Log.d(TAG, "Timer completed: $timerId")
    } else {
      // ── Tick ───────────────────────────────────────────────────────────
      val updated = timer.copy(elapsed = newElapsed, remaining = newRemaining)
      timers[timerId] = updated
      store.save(updated)
      emitTick(timerId, newElapsed, newRemaining)
      scheduleAlarm(updated) // schedule next tick
    }
  }

  // ── Event emission ─────────────────────────────────────────────────────────

  private fun emitTick(id: String, elapsed: Long, remaining: Long) {
    val params = JSONObject().apply {
      put("id", id)
      put("elapsed", elapsed)
      put("remaining", remaining)
    }
    emit("BGTimer.tick", params.toString())
  }

  private fun emitComplete(id: String) {
    val params = JSONObject().apply { put("id", id) }
    emit("BGTimer.complete", params.toString())
  }

  private fun emitStateChange(id: String) {
    val params = JSONObject().apply { put("id", id) }
    emit("BGTimer.stateChange", params.toString())
  }

  private fun emitError(id: String, code: String, message: String) {
    val params = JSONObject().apply {
      put("id", id)
      put("error", JSONObject().apply {
        put("code", code)
        put("message", message)
        put("timerId", id)
      })
    }
    emit("BGTimer.error", params.toString())
  }

  private fun emit(event: String, paramsJson: String) {
    reactContext
      ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      ?.emit(event, paramsJson)
  }

  // ── Foreground service management ─────────────────────────────────────────

  private fun promoteToForeground(config: AndroidNotificationConfig) {
    createNotificationChannel(config)
    val notification = buildNotification(config)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      // Android 14+: must specify foreground service type
      startForeground(
        NOTIFICATION_ID, notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun checkAndDemoteService() {
    val hasActiveTimers = timers.values.any {
      it.status == TimerStatus.RUNNING || it.status == TimerStatus.PAUSED
    }
    if (!hasActiveTimers) {
      stopForeground(STOP_FOREGROUND_REMOVE)
      releaseWakeLock()
      if (timers.isEmpty()) stopSelf()
    }
  }

  private fun createNotificationChannel(config: AndroidNotificationConfig) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val importance = when (config.importance) {
      "none" -> NotificationManager.IMPORTANCE_NONE
      "min" -> NotificationManager.IMPORTANCE_MIN
      "low" -> NotificationManager.IMPORTANCE_LOW
      "high" -> NotificationManager.IMPORTANCE_HIGH
      else -> NotificationManager.IMPORTANCE_LOW
    }

    val channel = NotificationChannel(config.channelId, config.channelName, importance).apply {
      setShowBadge(false)
      enableVibration(false)
    }

    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.createNotificationChannel(channel)
  }

  private fun buildNotification(config: AndroidNotificationConfig): Notification {
    // Try to find the icon by name; fall back to the app's icon
    val iconResId = runCatching {
      resources.getIdentifier(config.icon, "drawable", packageName)
        .takeIf { it != 0 }
    }.getOrNull() ?: applicationInfo.icon

    // Build a PendingIntent that re-opens the app
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = PendingIntent.getActivity(
      this, 0, launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    return NotificationCompat.Builder(this, config.channelId)
      .setContentTitle(config.title)
      .setContentText(config.text)
      .setSmallIcon(iconResId)
      .setColor(runCatching { Color.parseColor(config.color) }.getOrDefault(Color.BLACK))
      .setContentIntent(contentIntent)
      .setOngoing(true)
      .setSilent(true)
      .build()
  }

  // ── WakeLock helpers ──────────────────────────────────────────────────────

  private fun acquireWakeLock() {
    wakeLock?.let { if (!it.isHeld) it.acquire(MAX_WAKELOCK_MS) }
  }

  private fun releaseWakeLock() {
    wakeLock?.let { if (it.isHeld) it.release() }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Stable int request code derived from the timer ID string */
  private fun timerRequestCode(id: String): Int = id.hashCode() and 0x7FFFFFFF

  companion object {
    private const val TAG = "BGTimerService"
    const val ACTION_ALARM = "com.rick427.backgroundtimer.ALARM"
    const val EXTRA_TIMER_ID = "timer_id"
    private const val NOTIFICATION_ID = 7427
    private const val MAX_WAKELOCK_MS = 60 * 60 * 1000L // 1 hour safety cap
  }
}
