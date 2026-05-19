/**
 * useBackgroundTimer.ts
 *
 * React hook wrapper around BackgroundTimer.create().
 *
 * Handles:
 *  - Creating and destroying the native timer on mount/unmount
 *  - Subscribing to state updates and re-rendering the component
 *  - autoStart option
 *  - Stable callback refs so users don't need to memoize onComplete etc.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BackgroundTimer } from './BackgroundTimer';
import { registry } from './TimerRegistry';
import type {
  TimerState,
  TimerStatus,
  BackgroundTimerError,
  UseBackgroundTimerOptions,
  UseBackgroundTimerReturn,
} from './types';

// Stable ID generator for hook instances
let hookIdCounter = 0;
function generateHookId(): string {
  return `hook-timer-${Date.now()}-${++hookIdCounter}`;
}

export function useBackgroundTimer(
  options: UseBackgroundTimerOptions
): UseBackgroundTimerReturn {
  const {
    id: externalId,
    duration,
    tickInterval = 1000,
    persist = true,
    autoStart = false,
    android,
    ios,
    onComplete,
    onTick,
    onBackground,
    onForeground,
    onError,
  } = options;

  // Stable timer ID — computed once per mount
  const timerId = useMemo(
    () => externalId ?? generateHookId(),
    [externalId] // intentionally only re-runs when the external ID changes
  );

  // ── Stable callback refs ────────────────────────────────────────────────
  // These let the user pass inline arrow functions without causing re-creates
  const onCompleteRef = useRef(onComplete);
  const onTickRef = useRef(onTick);
  const onBackgroundRef = useRef(onBackground);
  const onForegroundRef = useRef(onForeground);
  const onErrorRef = useRef(onError);

  useLayoutEffect(() => {
    onCompleteRef.current = onComplete;
    onTickRef.current = onTick;
    onBackgroundRef.current = onBackground;
    onForegroundRef.current = onForeground;
    onErrorRef.current = onError;
  });

  // ── Local state (drives re-renders) ────────────────────────────────────
  const [timerState, setTimerState] = useState<TimerState>({
    id: timerId,
    status: 'idle',
    duration,
    elapsed: 0,
    remaining: duration,
    startedAt: null,
    completedAt: null,
    pausedAt: null,
  });
  const [isBackground, setIsBackground] = useState(registry.isAppInBackground);
  const [error, setError] = useState<BackgroundTimerError | null>(null);

  // ── Create timer on mount, destroy on unmount ───────────────────────────
  const handleRef = useRef(
    BackgroundTimer.create({
      id: timerId,
      duration,
      tickInterval,
      persist,
      android,
      ios,

      onComplete: () => {
        onCompleteRef.current?.();
      },

      onTick: (elapsed, remaining) => {
        onTickRef.current?.(elapsed, remaining);
      },

      onBackground: () => {
        setIsBackground(true);
        onBackgroundRef.current?.();
      },

      onForeground: () => {
        setIsBackground(false);
        onForegroundRef.current?.();
      },

      onError: (err) => {
        setError(err);
        onErrorRef.current?.(err);
      },
    })
  );

  useEffect(() => {
    const handle = handleRef.current;

    // Subscribe to state changes for re-renders
    const unsubscribe = registry.subscribeToState(timerId, (state) => {
      setTimerState(state);
    });

    // Auto-start if requested
    if (autoStart) {
      handle.start();
    }

    return () => {
      unsubscribe();
      handle.destroy();
    };
  }, [timerId]); // intentionally only re-runs when timerId changes (stable per mount)

  // ── Stable action callbacks ─────────────────────────────────────────────
  const start = useCallback(() => {
    setError(null);
    handleRef.current.start();
  }, []);

  const pause = useCallback(() => {
    handleRef.current.pause();
  }, []);

  const resume = useCallback(() => {
    handleRef.current.resume();
  }, []);

  const stop = useCallback(() => {
    handleRef.current.stop();
  }, []);

  const reset = useCallback(() => {
    handleRef.current.reset();
  }, []);

  return {
    start,
    pause,
    resume,
    stop,
    reset,
    elapsed: timerState.elapsed,
    remaining: timerState.remaining,
    status: timerState.status as TimerStatus,
    isBackground,
    error,
  };
}
