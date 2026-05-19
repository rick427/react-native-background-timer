/**
 * NativeBackgroundTimer.ts
 *
 * Turbo Module specification for @rick427/background-timer.
 * React Native Codegen reads this file to auto-generate the C++ JSI
 * bindings and the Java/Swift native stubs.
 *
 * Rules:
 *  - Only use types supported by Codegen (primitives, Object, ReadonlyArray, etc.)
 *  - Every method must have an explicit return type
 *  - addListener / removeListeners are required for NativeEventEmitter support
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

// Codegen-compatible representation of TimerState
export interface NativeTimerState {
  id: string;
  status: string;      // 'idle' | 'running' | 'paused' | 'completed' | 'stopped'
  duration: number;
  elapsed: number;
  remaining: number;
  startedAt: number;   // 0 if null
  completedAt: number; // 0 if null
  pausedAt: number;    // 0 if null
}

// Codegen-compatible Android notification config
export interface NativeAndroidNotificationConfig {
  title: string;
  text: string;
  icon: string;
  color: string;
  importance: string;
  channelId: string;
  channelName: string;
}

export interface Spec extends TurboModule {
  // ── Event emitter boilerplate (required for NativeEventEmitter) ──────────
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;

  // ── Timer lifecycle ───────────────────────────────────────────────────────

  /**
   * Create a timer record in native. Does NOT start it yet.
   * @param id         Unique string ID
   * @param duration   Total duration in ms
   * @param tickInterval How often to emit tick events (ms). 0 = no ticks.
   * @param persist    Whether to persist state to disk
   * @param androidConfig Android notification config (JSON stringified)
   * @param iosTaskIdentifier iOS BGTaskScheduler identifier
   */
  createTimer: (
    id: string,
    duration: number,
    tickInterval: number,
    persist: boolean,
    androidConfig: string,   // JSON string of NativeAndroidNotificationConfig
    iosTaskIdentifier: string
  ) => void;

  /** Start (or restart) a timer that was previously created. */
  startTimer: (id: string) => void;

  /** Pause a running timer. Elapsed time is preserved. */
  pauseTimer: (id: string) => void;

  /** Resume a paused timer. */
  resumeTimer: (id: string) => void;

  /**
   * Stop a timer. Resets elapsed to 0. Does NOT fire the complete event.
   */
  stopTimer: (id: string) => void;

  /**
   * Reset a running/paused timer back to its initial duration.
   * Keeps running if it was running.
   */
  resetTimer: (id: string) => void;

  /**
   * Destroy a timer and release all native resources (WakeLock, service, BGTask).
   */
  destroyTimer: (id: string) => void;

  // ── State queries ────────────────────────────────────────────────────────

  /** Returns the current state of a single timer. */
  getTimerState: (id: string) => NativeTimerState;

  /**
   * Returns all persisted timers — useful on app relaunch to check if any
   * timers completed while the app was killed.
   */
  getPersistedTimers: () => NativeTimerState[];

  // ── Legacy drop-in API (setTimeout / setInterval compat) ─────────────────

  /**
   * Schedules a one-shot background timer. Emits 'BGTimer.legacy.timeout'
   * with callbackId when it fires.
   */
  legacySetTimeout: (callbackId: number, delay: number) => void;

  /**
   * Schedules a repeating background timer. Emits 'BGTimer.legacy.tick'
   * with callbackId on each interval.
   */
  legacySetInterval: (callbackId: number, interval: number) => void;

  /**
   * Cancels a legacy timer (setTimeout or setInterval).
   */
  legacyClear: (callbackId: number) => void;

  // ── Permissions ──────────────────────────────────────────────────────────

  /**
   * Android 12+: Check if SCHEDULE_EXACT_ALARM permission is granted.
   * Always returns true on iOS and Android < 12.
   */
  canScheduleExactAlarms: () => boolean;

  /**
   * Android 12+: Open system settings to the exact alarm permission screen.
   * No-op on iOS.
   */
  requestExactAlarmPermission: () => void;
}

export default TurboModuleRegistry.strictGet<Spec>('RNBackgroundTimer');
