/**
 * @rick427/react-native-bg-timer
 *
 * A modern, reliable React Native background timer.
 * Supports iOS 13+ (BGTaskScheduler) and Android 8+ (Foreground Service + AlarmManager).
 * Built with Turbo Modules for React Native New Architecture.
 */

// ── Main imperative API ──────────────────────────────────────────────────────
export { BackgroundTimer } from './BackgroundTimer';

// ── React hook ───────────────────────────────────────────────────────────────
export { useBackgroundTimer } from './useBackgroundTimer';

// ── Types (re-exported for consumers) ────────────────────────────────────────
export type {
  // Options
  BackgroundTimerOptions,
  UseBackgroundTimerOptions,
  AndroidNotificationConfig,
  IOSConfig,

  // State & handles
  TimerHandle,
  TimerState,
  TimerStatus,

  // Hook return
  UseBackgroundTimerReturn,

  // Errors
  BackgroundTimerError,

  // Legacy compat
  LegacyTimeoutId,
  LegacyIntervalId,
} from './types';

// ── Default export (matches old package's import style) ───────────────────────
export { BackgroundTimer as default } from './BackgroundTimer';
