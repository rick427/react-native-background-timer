package com.rick427.backgroundtimer

import org.json.JSONObject

/**
 * Immutable snapshot of a single timer's state.
 * Serialized to/from JSON for SharedPreferences persistence.
 */
data class TimerData(
  val id: String,
  val status: TimerStatus,
  val duration: Long,          // ms
  val elapsed: Long,           // ms
  val remaining: Long,         // ms
  val tickInterval: Long,      // ms (0 = no ticks)
  val startedAt: Long,         // epoch ms (0 = never started)
  val completedAt: Long,       // epoch ms (0 = not completed)
  val pausedAt: Long,          // epoch ms (0 = not paused)
  val persist: Boolean,
  val androidConfig: AndroidNotificationConfig,
  val iosTaskIdentifier: String,
) {
  fun toJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("status", status.value)
    put("duration", duration)
    put("elapsed", elapsed)
    put("remaining", remaining)
    put("tickInterval", tickInterval)
    put("startedAt", startedAt)
    put("completedAt", completedAt)
    put("pausedAt", pausedAt)
    put("persist", persist)
    put("androidConfig", androidConfig.toJson())
    put("iosTaskIdentifier", iosTaskIdentifier)
  }

  companion object {
    fun fromJson(json: JSONObject): TimerData = TimerData(
      id = json.getString("id"),
      status = TimerStatus.fromValue(json.getString("status")),
      duration = json.getLong("duration"),
      elapsed = json.getLong("elapsed"),
      remaining = json.getLong("remaining"),
      tickInterval = json.getLong("tickInterval"),
      startedAt = json.getLong("startedAt"),
      completedAt = json.getLong("completedAt"),
      pausedAt = json.getLong("pausedAt"),
      persist = json.getBoolean("persist"),
      androidConfig = AndroidNotificationConfig.fromJson(
        json.getJSONObject("androidConfig")
      ),
      iosTaskIdentifier = json.getString("iosTaskIdentifier"),
    )
  }
}

enum class TimerStatus(val value: String) {
  IDLE("idle"),
  RUNNING("running"),
  PAUSED("paused"),
  COMPLETED("completed"),
  STOPPED("stopped");

  companion object {
    fun fromValue(value: String): TimerStatus =
      entries.firstOrNull { it.value == value } ?: IDLE
  }
}

data class AndroidNotificationConfig(
  val title: String,
  val text: String,
  val icon: String,
  val color: String,
  val importance: String,
  val channelId: String,
  val channelName: String,
) {
  fun toJson(): JSONObject = JSONObject().apply {
    put("title", title)
    put("text", text)
    put("icon", icon)
    put("color", color)
    put("importance", importance)
    put("channelId", channelId)
    put("channelName", channelName)
  }

  companion object {
    val DEFAULT = AndroidNotificationConfig(
      title = "Timer Running",
      text = "A background timer is active",
      icon = "ic_notification",
      color = "#000000",
      importance = "low",
      channelId = "background_timer_channel",
      channelName = "Background Timer",
    )

    fun fromJson(json: JSONObject): AndroidNotificationConfig = AndroidNotificationConfig(
      title = json.optString("title", DEFAULT.title),
      text = json.optString("text", DEFAULT.text),
      icon = json.optString("icon", DEFAULT.icon),
      color = json.optString("color", DEFAULT.color),
      importance = json.optString("importance", DEFAULT.importance),
      channelId = json.optString("channelId", DEFAULT.channelId),
      channelName = json.optString("channelName", DEFAULT.channelName),
    )

    fun fromJsonString(jsonString: String): AndroidNotificationConfig =
      if (jsonString.isBlank()) DEFAULT
      else runCatching { fromJson(JSONObject(jsonString)) }.getOrDefault(DEFAULT)
  }
}
