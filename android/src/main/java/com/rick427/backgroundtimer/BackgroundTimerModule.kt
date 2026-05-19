package com.rick427.backgroundtimer

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

/**
 * BackgroundTimerModule
 *
 * The Turbo Module that bridges JS calls to BackgroundTimerService.
 * Implements the spec defined in NativeBackgroundTimer.ts (codegen).
 *
 * Architecture:
 *  JS → Turbo Module (this class) → binds to BackgroundTimerService → AlarmManager
 *  Native events → DeviceEventManagerModule → JS NativeEventEmitter
 */
@ReactModule(name = BackgroundTimerModule.NAME)
class BackgroundTimerModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "RNBackgroundTimer"
    private const val TAG = "BGTimerModule"
  }

  // ── Service binding ────────────────────────────────────────────────────────

  private var service: BackgroundTimerService? = null
  private var isServiceBound = false

  private val connection = object : ServiceConnection {
    override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
      service = (binder as BackgroundTimerService.LocalBinder).getService()
      service?.setReactContext(reactContext)
      isServiceBound = true
      Log.d(TAG, "Service connected")
    }

    override fun onServiceDisconnected(name: ComponentName?) {
      service = null
      isServiceBound = false
      Log.d(TAG, "Service disconnected")
    }
  }

  override fun getName() = NAME

  override fun initialize() {
    super.initialize()
    bindService()
  }

  override fun invalidate() {
    super.invalidate()
    if (isServiceBound) {
      reactContext.unbindService(connection)
      isServiceBound = false
    }
  }

  private fun bindService() {
    val intent = Intent(reactContext, BackgroundTimerService::class.java)
    reactContext.bindService(intent, connection, Context.BIND_AUTO_CREATE)
  }

  private fun ensureServiceAndRun(block: (BackgroundTimerService) -> Unit) {
    val svc = service
    if (svc != null) {
      block(svc)
    } else {
      // Service not yet bound — retry once after binding
      bindService()
      Log.w(TAG, "Service not bound yet, retrying...")
    }
  }

  // ── NativeEventEmitter boilerplate ────────────────────────────────────────

  @ReactMethod
  fun addListener(eventName: String) {
    // No-op — listeners are wired up in TimerRegistry.ts on the JS side
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // No-op
  }

  // ── Timer lifecycle ────────────────────────────────────────────────────────

  @ReactMethod
  fun createTimer(
    id: String,
    duration: Double,
    tickInterval: Double,
    persist: Boolean,
    androidConfigJson: String,
    iosTaskIdentifier: String,
  ) {
    ensureServiceAndRun { svc ->
      val config = AndroidNotificationConfig.fromJsonString(androidConfigJson)
      val data = TimerData(
        id = id,
        status = TimerStatus.IDLE,
        duration = duration.toLong(),
        elapsed = 0L,
        remaining = duration.toLong(),
        tickInterval = tickInterval.toLong(),
        startedAt = 0L,
        completedAt = 0L,
        pausedAt = 0L,
        persist = persist,
        androidConfig = config,
        iosTaskIdentifier = iosTaskIdentifier,
      )
      svc.createTimer(data)
    }
  }

  @ReactMethod
  fun startTimer(id: String) {
    ensureServiceAndRun { it.startTimer(id) }
    // Also start the service as a foreground service (required for background)
    val intent = Intent(reactContext, BackgroundTimerService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      reactContext.startForegroundService(intent)
    } else {
      reactContext.startService(intent)
    }
  }

  @ReactMethod
  fun pauseTimer(id: String) {
    ensureServiceAndRun { it.pauseTimer(id) }
  }

  @ReactMethod
  fun resumeTimer(id: String) {
    ensureServiceAndRun { it.resumeTimer(id) }
  }

  @ReactMethod
  fun stopTimer(id: String) {
    ensureServiceAndRun { it.stopTimer(id) }
  }

  @ReactMethod
  fun resetTimer(id: String) {
    ensureServiceAndRun { it.resetTimer(id) }
  }

  @ReactMethod
  fun destroyTimer(id: String) {
    ensureServiceAndRun { it.destroyTimer(id) }
  }

  // ── State queries ──────────────────────────────────────────────────────────

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun getTimerState(id: String): WritableMap {
    val data = service?.getTimerState(id)
    return if (data != null) timerDataToMap(data)
    else emptyTimerMap(id)
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun getPersistedTimers(): WritableArray {
    val store = TimerStore(reactContext)
    val result = Arguments.createArray()
    store.loadAll().forEach { result.pushMap(timerDataToMap(it)) }
    return result
  }

  // ── Legacy API ─────────────────────────────────────────────────────────────

  private val legacyTimers = mutableMapOf<Int, TimerData>()

  @ReactMethod
  fun legacySetTimeout(callbackId: Double, delay: Double) {
    val id = callbackId.toInt()
    val timerId = "legacy-timeout-$id"
    ensureServiceAndRun { svc ->
      val data = TimerData(
        id = timerId,
        status = TimerStatus.IDLE,
        duration = delay.toLong(),
        elapsed = 0L,
        remaining = delay.toLong(),
        tickInterval = 0L,  // no ticks — just fire once
        startedAt = 0L,
        completedAt = 0L,
        pausedAt = 0L,
        persist = false,
        androidConfig = AndroidNotificationConfig.DEFAULT,
        iosTaskIdentifier = "",
      )
      svc.createTimer(data)
      svc.startTimer(timerId)
    }
  }

  @ReactMethod
  fun legacySetInterval(callbackId: Double, interval: Double) {
    val id = callbackId.toInt()
    val timerId = "legacy-interval-$id"
    ensureServiceAndRun { svc ->
      val data = TimerData(
        id = timerId,
        status = TimerStatus.IDLE,
        duration = Long.MAX_VALUE,  // runs indefinitely until cleared
        elapsed = 0L,
        remaining = Long.MAX_VALUE,
        tickInterval = interval.toLong(),
        startedAt = 0L,
        completedAt = 0L,
        pausedAt = 0L,
        persist = false,
        androidConfig = AndroidNotificationConfig.DEFAULT,
        iosTaskIdentifier = "",
      )
      svc.createTimer(data)
      svc.startTimer(timerId)
    }
  }

  @ReactMethod
  fun legacyClear(callbackId: Double) {
    val id = callbackId.toInt()
    // Try both timeout and interval IDs
    ensureServiceAndRun { svc ->
      svc.destroyTimer("legacy-timeout-$id")
      svc.destroyTimer("legacy-interval-$id")
    }
  }

  // ── Permissions ────────────────────────────────────────────────────────────

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun canScheduleExactAlarms(): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val am = reactContext.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
      am.canScheduleExactAlarms()
    } else {
      true
    }
  }

  @ReactMethod
  fun requestExactAlarmPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
      }
      reactContext.startActivity(intent)
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private fun timerDataToMap(data: TimerData): WritableMap =
    Arguments.createMap().apply {
      putString("id", data.id)
      putString("status", data.status.value)
      putDouble("duration", data.duration.toDouble())
      putDouble("elapsed", data.elapsed.toDouble())
      putDouble("remaining", data.remaining.toDouble())
      putDouble("startedAt", data.startedAt.toDouble())
      putDouble("completedAt", data.completedAt.toDouble())
      putDouble("pausedAt", data.pausedAt.toDouble())
    }

  private fun emptyTimerMap(id: String): WritableMap =
    Arguments.createMap().apply {
      putString("id", id)
      putString("status", "idle")
      putDouble("duration", 0.0)
      putDouble("elapsed", 0.0)
      putDouble("remaining", 0.0)
      putDouble("startedAt", 0.0)
      putDouble("completedAt", 0.0)
      putDouble("pausedAt", 0.0)
    }
}
