package com.rick427.backgroundtimer

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

/**
 * Persists timer state to SharedPreferences so it survives app kills.
 * Key schema: "timer_<id>" → JSON string of TimerData
 */
class TimerStore(context: Context) {

  private val prefs: SharedPreferences =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  // ── Write ─────────────────────────────────────────────────────────────────

  fun save(timer: TimerData) {
    if (!timer.persist) return
    prefs.edit()
      .putString(timerKey(timer.id), timer.toJson().toString())
      .apply()
  }

  fun delete(id: String) {
    prefs.edit().remove(timerKey(id)).apply()
  }

  fun clear() {
    prefs.edit()
      .apply { prefs.all.keys.filter { it.startsWith(KEY_PREFIX) }.forEach { remove(it) } }
      .apply()
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  fun load(id: String): TimerData? {
    val raw = prefs.getString(timerKey(id), null) ?: return null
    return runCatching { TimerData.fromJson(JSONObject(raw)) }.getOrNull()
  }

  fun loadAll(): List<TimerData> {
    return prefs.all.entries
      .filter { it.key.startsWith(KEY_PREFIX) }
      .mapNotNull { entry ->
        runCatching { TimerData.fromJson(JSONObject(entry.value as String)) }.getOrNull()
      }
  }

  private fun timerKey(id: String) = "$KEY_PREFIX$id"

  companion object {
    private const val PREFS_NAME = "RNBackgroundTimer"
    private const val KEY_PREFIX = "timer_"
  }
}
