/**
 * TimerRegistry.ts
 *
 * Singleton that owns all active timer option maps and JS-side callbacks.
 * The native layer holds timer state (elapsed, remaining, status).
 * The JS layer holds callbacks (onComplete, onTick, onBackground, etc.)
 * and merges them together when events arrive from native.
 */

import { NativeEventEmitter, AppState, type AppStateStatus } from 'react-native';
import type {
  BackgroundTimerOptions,
  TimerState,
  BackgroundTimerError,
} from './types';
import NativeBackgroundTimer from './NativeBackgroundTimer';

// ─── Event Names ──────────────────────────────────────────────────────────────
// Keep in sync with native emitters

export const EVENTS = {
  TICK: 'BGTimer.tick',
  COMPLETE: 'BGTimer.complete',
  ERROR: 'BGTimer.error',
  STATE_CHANGE: 'BGTimer.stateChange',
  LEGACY_TIMEOUT: 'BGTimer.legacy.timeout',
  LEGACY_TICK: 'BGTimer.legacy.tick',
} as const;

// ─── Internal callback store ──────────────────────────────────────────────────

interface TimerCallbacks {
  onComplete?: () => void;
  onTick?: (elapsed: number, remaining: number) => void;
  onBackground?: () => void;
  onForeground?: () => void;
  onError?: (error: BackgroundTimerError) => void;
}

interface LegacyEntry {
  callback: () => void;
  isInterval: boolean;
  interval?: number;
  active: boolean;
}

// ─── TimerRegistry class ──────────────────────────────────────────────────────

class TimerRegistry {
  private callbacks = new Map<string, TimerCallbacks>();
  private legacyCallbacks = new Map<number, LegacyEntry>();
  private stateListeners = new Map<string, Set<(state: TimerState) => void>>();
  private emitter: NativeEventEmitter;
  private appState: AppStateStatus = AppState.currentState;
  private legacyIdCounter = 0;

  constructor() {
    this.emitter = new NativeEventEmitter(NativeBackgroundTimer);
    this.setupEventListeners();
    this.setupAppStateListener();
  }

  // ── Public: register a timer ────────────────────────────────────────────

  register(options: BackgroundTimerOptions): void {
    const {
      id,
      onComplete,
      onTick,
      onBackground,
      onForeground,
      onError,
    } = options;

    this.callbacks.set(id, {
      onComplete,
      onTick,
      onBackground,
      onForeground,
      onError,
    });
  }

  unregister(id: string): void {
    this.callbacks.delete(id);
    this.stateListeners.delete(id);
  }

  // ── Public: state change subscriptions (used by the hook) ──────────────

  subscribeToState(id: string, listener: (state: TimerState) => void): () => void {
    if (!this.stateListeners.has(id)) {
      this.stateListeners.set(id, new Set());
    }
    this.stateListeners.get(id)!.add(listener);

    return () => {
      this.stateListeners.get(id)?.delete(listener);
    };
  }

  // ── Public: legacy API ──────────────────────────────────────────────────

  nextLegacyId(): number {
    return ++this.legacyIdCounter;
  }

  registerLegacy(
    id: number,
    callback: () => void,
    isInterval: boolean,
    interval?: number
  ): void {
    this.legacyCallbacks.set(id, { callback, isInterval, interval, active: true });
  }

  unregisterLegacy(id: number): void {
    const entry = this.legacyCallbacks.get(id);
    if (entry) {
      entry.active = false;
      this.legacyCallbacks.delete(id);
    }
  }

  // ── Private: native event wiring ────────────────────────────────────────

  private setupEventListeners(): void {
    // Timer tick — fires every tickInterval ms
    this.emitter.addListener(EVENTS.TICK, (event: { id: string; elapsed: number; remaining: number }) => {
      const cbs = this.callbacks.get(event.id);
      cbs?.onTick?.(event.elapsed, event.remaining);

      this.notifyStateListeners(event.id);
    });

    // Timer complete — fires when remaining hits 0
    this.emitter.addListener(EVENTS.COMPLETE, (event: { id: string }) => {
      const cbs = this.callbacks.get(event.id);
      cbs?.onComplete?.();
      this.notifyStateListeners(event.id);
    });

    // Timer error
    this.emitter.addListener(EVENTS.ERROR, (event: { id: string; error: BackgroundTimerError }) => {
      const cbs = this.callbacks.get(event.id);
      cbs?.onError?.(event.error);
    });

    // Generic state change (pause, resume, stop, reset)
    this.emitter.addListener(EVENTS.STATE_CHANGE, (event: { id: string }) => {
      this.notifyStateListeners(event.id);
    });

    // Legacy: one-shot timeout fired
    this.emitter.addListener(EVENTS.LEGACY_TIMEOUT, (event: { callbackId: number }) => {
      const entry = this.legacyCallbacks.get(event.callbackId);
      if (entry?.active) {
        entry.callback();
        this.legacyCallbacks.delete(event.callbackId);
      }
    });

    // Legacy: interval tick
    this.emitter.addListener(EVENTS.LEGACY_TICK, (event: { callbackId: number }) => {
      const entry = this.legacyCallbacks.get(event.callbackId);
      if (entry?.active) {
        entry.callback();
        // interval stays registered — native re-fires it
      }
    });
  }

  private setupAppStateListener(): void {
    AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasBackground = this.appState === 'background';
      const isBackground = nextState === 'background';
      this.appState = nextState;

      this.callbacks.forEach((cbs) => {
        if (!wasBackground && isBackground) {
          cbs.onBackground?.();
        } else if (wasBackground && !isBackground) {
          cbs.onForeground?.();
        }
      });
    });
  }

  private notifyStateListeners(id: string): void {
    const listeners = this.stateListeners.get(id);
    if (!listeners?.size) return;

    // Fetch current state from native and notify all JS subscribers
    try {
      const nativeState = NativeBackgroundTimer.getTimerState(id);
      const state: TimerState = {
        id: nativeState.id,
        status: nativeState.status as TimerState['status'],
        duration: nativeState.duration,
        elapsed: nativeState.elapsed,
        remaining: nativeState.remaining,
        startedAt: nativeState.startedAt || null,
        completedAt: nativeState.completedAt || null,
        pausedAt: nativeState.pausedAt || null,
      };
      listeners.forEach((listener) => listener(state));
    } catch {
      // Timer may have been destroyed — ignore
    }
  }

  get isAppInBackground(): boolean {
    return this.appState === 'background';
  }
}

// Export as a singleton
export const registry = new TimerRegistry();
