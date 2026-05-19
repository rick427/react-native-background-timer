/**
 * BackgroundTimer.ts
 *
 * The main imperative API for @rick427/background-timer.
 *
 * Three usage styles:
 *
 *  1. Rich API  — BackgroundTimer.create({ id, duration, onComplete, ... })
 *  2. Legacy    — BackgroundTimer.setTimeout(fn, delay) / setInterval(fn, ms)
 *  3. Queries   — BackgroundTimer.getPersistedTimers() on relaunch
 */

import { Platform } from 'react-native';
import NativeBackgroundTimer from './NativeBackgroundTimer';
import { registry } from './TimerRegistry';
import type {
  BackgroundTimerOptions,
  TimerHandle,
  TimerState,
  LegacyTimeoutId,
  LegacyIntervalId,
  AndroidNotificationConfig,
} from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_TICK_INTERVAL = 1000;
const DEFAULT_ANDROID_CONFIG: Required<AndroidNotificationConfig> = {
  title: 'Timer Running',
  text: 'A background timer is active',
  icon: 'ic_notification',
  color: '#000000',
  importance: 'low',
  channelId: 'background_timer_channel',
  channelName: 'Background Timer',
};

function buildAndroidConfigJson(config?: AndroidNotificationConfig): string {
  const merged = { ...DEFAULT_ANDROID_CONFIG, ...config };
  return JSON.stringify(merged);
}

function toTimerState(native: ReturnType<typeof NativeBackgroundTimer.getTimerState>): TimerState {
  return {
    id: native.id,
    status: native.status as TimerState['status'],
    duration: native.duration,
    elapsed: native.elapsed,
    remaining: native.remaining,
    startedAt: native.startedAt || null,
    completedAt: native.completedAt || null,
    pausedAt: native.pausedAt || null,
  };
}

// ─── BackgroundTimer ──────────────────────────────────────────────────────────

class BackgroundTimerClass {
  // ── Rich API ──────────────────────────────────────────────────────────────

  /**
   * Create a new background timer.
   *
   * @example
   * const timer = BackgroundTimer.create({
   *   id: 'session-timeout',
   *   duration: 5 * 60 * 1000,
   *   onComplete: () => logoutUser(),
   *   onTick: (elapsed, remaining) => setCountdown(remaining),
   *   android: { title: 'Session active', text: 'Tap to return to the app' },
   * });
   * timer.start();
   */
  create(options: BackgroundTimerOptions): TimerHandle {
    const {
      id,
      duration,
      tickInterval = DEFAULT_TICK_INTERVAL,
      persist = true,
      android,
      ios,
    } = options;

    // Register JS-side callbacks in the registry
    registry.register(options);

    // Tell native to create the timer record
    NativeBackgroundTimer.createTimer(
      id,
      duration,
      tickInterval,
      persist,
      buildAndroidConfigJson(android),
      ios?.taskIdentifier ?? `com.rick427.backgroundtimer.${id}`
    );

    // Return a handle that lets the caller control the timer
    const handle: TimerHandle = {
      id,

      start: () => {
        NativeBackgroundTimer.startTimer(id);
      },

      pause: () => {
        NativeBackgroundTimer.pauseTimer(id);
      },

      resume: () => {
        NativeBackgroundTimer.resumeTimer(id);
      },

      stop: () => {
        NativeBackgroundTimer.stopTimer(id);
      },

      reset: () => {
        NativeBackgroundTimer.resetTimer(id);
      },

      getState: (): TimerState => {
        return toTimerState(NativeBackgroundTimer.getTimerState(id));
      },

      destroy: () => {
        NativeBackgroundTimer.destroyTimer(id);
        registry.unregister(id);
      },
    };

    return handle;
  }

  // ── Persistence query ────────────────────────────────────────────────────

  /**
   * Returns all timers that were persisted to disk.
   * Call this on app launch to check if any timer completed while the app
   * was killed (e.g. to auto-logout the user on the next open).
   *
   * @example
   * const persisted = BackgroundTimer.getPersistedTimers();
   * const expired = persisted.find(t => t.id === 'session-timeout' && t.status === 'completed');
   * if (expired) logoutUser();
   */
  getPersistedTimers(): TimerState[] {
    return NativeBackgroundTimer.getPersistedTimers().map(toTimerState);
  }

  /**
   * Get the current live state of a running timer by ID.
   */
  getTimerState(id: string): TimerState {
    return toTimerState(NativeBackgroundTimer.getTimerState(id));
  }

  // ── Permissions ──────────────────────────────────────────────────────────

  /**
   * Android 12+ only. Returns true if SCHEDULE_EXACT_ALARM is granted.
   * Always returns true on iOS and Android < 12.
   *
   * Call this before starting a timer if precision matters.
   */
  canScheduleExactAlarms(): boolean {
    if (Platform.OS === 'ios') return true;
    return NativeBackgroundTimer.canScheduleExactAlarms();
  }

  /**
   * Android 12+ only. Opens the system settings page for exact alarm
   * permission. No-op on iOS.
   *
   * The user must grant permission manually — there is no runtime prompt.
   * Listen for AppState 'active' events after calling this to re-check.
   */
  requestExactAlarmPermission(): void {
    if (Platform.OS === 'android') {
      NativeBackgroundTimer.requestExactAlarmPermission();
    }
  }

  // ── Legacy drop-in API ───────────────────────────────────────────────────

  /**
   * Drop-in replacement for `setTimeout` that keeps firing even when the
   * app is in the background.
   *
   * Returns a numeric ID that can be passed to clearTimeout().
   *
   * @example
   * const id = BackgroundTimer.setTimeout(() => logoutUser(), 5 * 60 * 1000);
   * // later:
   * BackgroundTimer.clearTimeout(id);
   */
  setTimeout(callback: () => void, delay: number): LegacyTimeoutId {
    const id = registry.nextLegacyId();
    registry.registerLegacy(id, callback, false);
    NativeBackgroundTimer.legacySetTimeout(id, delay);
    return id;
  }

  /**
   * Cancel a background timeout created with BackgroundTimer.setTimeout().
   */
  clearTimeout(id: LegacyTimeoutId): void {
    registry.unregisterLegacy(id);
    NativeBackgroundTimer.legacyClear(id);
  }

  /**
   * Drop-in replacement for `setInterval` that keeps ticking even when the
   * app is in the background.
   *
   * Returns a numeric ID that can be passed to clearInterval().
   *
   * @example
   * const id = BackgroundTimer.setInterval(() => refreshToken(), 30_000);
   * // later:
   * BackgroundTimer.clearInterval(id);
   */
  setInterval(callback: () => void, interval: number): LegacyIntervalId {
    const id = registry.nextLegacyId();
    registry.registerLegacy(id, callback, true, interval);
    NativeBackgroundTimer.legacySetInterval(id, interval);
    return id;
  }

  /**
   * Cancel a background interval created with BackgroundTimer.setInterval().
   */
  clearInterval(id: LegacyIntervalId): void {
    registry.unregisterLegacy(id);
    NativeBackgroundTimer.legacyClear(id);
  }
}

export const BackgroundTimer = new BackgroundTimerClass();
