// ─── Timer Status ────────────────────────────────────────────────────────────

export type TimerStatus =
  | 'idle'       // created but never started
  | 'running'    // actively counting down
  | 'paused'     // paused mid-countdown
  | 'completed'  // hit zero and fired onComplete
  | 'stopped';   // manually stopped before completion

// ─── Android Notification Config ─────────────────────────────────────────────

export interface AndroidNotificationConfig {
  /**
   * Notification title shown in the status bar while the timer runs.
   * @default 'Timer Running'
   */
  title?: string;

  /**
   * Notification body text.
   * @default 'A background timer is active'
   */
  text?: string;

  /**
   * Drawable resource name for the small notification icon.
   * Must exist in your Android res/drawable folder.
   * @default 'ic_notification'
   */
  icon?: string;

  /**
   * Hex color string for the notification accent color (e.g. '#FF6B35').
   * @default '#000000'
   */
  color?: string;

  /**
   * Android notification channel importance.
   * 'low' = no sound/vibration (recommended for timers).
   * @default 'low'
   */
  importance?: 'none' | 'min' | 'low' | 'default' | 'high';

  /**
   * Notification channel ID. Change this to create a new channel.
   * @default 'background_timer_channel'
   */
  channelId?: string;

  /**
   * Notification channel name shown in Android settings.
   * @default 'Background Timer'
   */
  channelName?: string;
}

// ─── iOS-specific Config ─────────────────────────────────────────────────────

export interface IOSConfig {
  /**
   * BGTask identifier registered in Info.plist under
   * BGTaskSchedulerPermittedIdentifiers.
   * Defaults to 'com.rick427.backgroundtimer.<timerId>'
   */
  taskIdentifier?: string;
}

// ─── Timer Options ────────────────────────────────────────────────────────────

export interface BackgroundTimerOptions {
  /**
   * Unique string ID for this timer.
   * Use a meaningful name — e.g. 'session-timeout', 'otp-expiry'.
   * Required so you can reference, pause, or stop it later.
   */
  id: string;

  /**
   * Total duration of the timer in milliseconds.
   */
  duration: number;

  /**
   * How often onTick fires (in ms). Set to 0 to disable ticking.
   * @default 1000
   */
  tickInterval?: number;

  /**
   * Fired when the timer reaches zero.
   */
  onComplete?: () => void;

  /**
   * Fired every `tickInterval` ms with current elapsed and remaining time.
   */
  onTick?: (elapsed: number, remaining: number) => void;

  /**
   * Fired when the app moves to the background while the timer is running.
   */
  onBackground?: () => void;

  /**
   * Fired when the app returns to the foreground while the timer is running.
   */
  onForeground?: () => void;

  /**
   * Fired if a native error occurs (e.g. permission denied, alarm failed).
   */
  onError?: (error: BackgroundTimerError) => void;

  /**
   * If true, timer state is persisted to disk. On app relaunch, you can
   * check if the timer already completed via BackgroundTimer.getPersistedTimers().
   * @default true
   */
  persist?: boolean;

  /**
   * Android-specific notification configuration.
   * A foreground service notification is required on Android 8+.
   */
  android?: AndroidNotificationConfig;

  /**
   * iOS-specific configuration.
   */
  ios?: IOSConfig;
}

// ─── Timer State ─────────────────────────────────────────────────────────────

export interface TimerState {
  id: string;
  status: TimerStatus;
  duration: number;
  elapsed: number;
  remaining: number;
  startedAt: number | null;     // unix ms
  completedAt: number | null;   // unix ms — set when timer completes
  pausedAt: number | null;      // unix ms — set when paused
}

// ─── Timer Handle ─────────────────────────────────────────────────────────────

/** Returned by BackgroundTimer.create(). Use this to control the timer. */
export interface TimerHandle {
  /** Unique ID for this timer */
  readonly id: string;

  /** Start counting down. No-op if already running. */
  start: () => void;

  /** Pause the countdown. Elapsed time is preserved. */
  pause: () => void;

  /** Resume from a paused state. No-op if not paused. */
  resume: () => void;

  /** Stop the timer and reset elapsed to 0. Does NOT fire onComplete. */
  stop: () => void;

  /** Reset to initial state without stopping the background task. */
  reset: () => void;

  /** Get the current state snapshot. */
  getState: () => TimerState;

  /** Dispose of this timer handle and all its native resources. */
  destroy: () => void;
}

// ─── Error ───────────────────────────────────────────────────────────────────

export interface BackgroundTimerError {
  code:
    | 'PERMISSION_DENIED'    // exact alarm permission not granted (Android 12+)
    | 'SERVICE_FAILED'       // foreground service could not start
    | 'TASK_EXPIRED'         // iOS background task expired before timer completed
    | 'TIMER_NOT_FOUND'      // operation on a non-existent timer ID
    | 'ALREADY_RUNNING'      // tried to start an already-running timer
    | 'UNKNOWN';
  message: string;
  timerId?: string;
}

// ─── Hook Return Type ─────────────────────────────────────────────────────────

export interface UseBackgroundTimerReturn {
  /** Start the timer. */
  start: () => void;
  /** Pause mid-countdown. */
  pause: () => void;
  /** Resume from paused. */
  resume: () => void;
  /** Stop and reset. */
  stop: () => void;
  /** Reset to full duration without stopping. */
  reset: () => void;
  /** Current elapsed ms */
  elapsed: number;
  /** Current remaining ms */
  remaining: number;
  /** Current timer status */
  status: TimerStatus;
  /** Is the app currently in the background? */
  isBackground: boolean;
  /** Last error, if any */
  error: BackgroundTimerError | null;
}

// ─── Hook Options ─────────────────────────────────────────────────────────────

export interface UseBackgroundTimerOptions
  extends Omit<BackgroundTimerOptions, 'id'> {
  /**
   * Optional stable ID. If omitted, a UUID is generated.
   * Pass a stable ID (e.g. from useRef or a constant) to avoid
   * recreating the timer on re-renders.
   */
  id?: string;

  /**
   * If true, the timer starts immediately on mount.
   * @default false
   */
  autoStart?: boolean;
}

// ─── Legacy Compat Types ──────────────────────────────────────────────────────

export type LegacyTimeoutId = number;
export type LegacyIntervalId = number;
