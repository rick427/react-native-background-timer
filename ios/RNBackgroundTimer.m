/**
 * RNBackgroundTimer.m
 *
 * Objective-C bridge header for the Swift Turbo Module.
 * Exposes the Swift class and its methods to React Native's runtime.
 *
 * For New Architecture (Turbo Modules), the RCT_EXTERN_MODULE macro
 * registers the module with the TurboModuleManager instead of the old bridge.
 */

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

RCT_EXTERN_MODULE(RNBackgroundTimer, RCTEventEmitter)

// ── Timer lifecycle ────────────────────────────────────────────────────────

RCT_EXTERN_METHOD(
  createTimer:(NSString *)id
  duration:(double)duration
  tickInterval:(double)tickInterval
  persist:(BOOL)persist
  androidConfig:(NSString *)androidConfig
  iosTaskIdentifier:(NSString *)iosTaskIdentifier
)

RCT_EXTERN_METHOD(startTimer:(NSString *)id)
RCT_EXTERN_METHOD(pauseTimer:(NSString *)id)
RCT_EXTERN_METHOD(resumeTimer:(NSString *)id)
RCT_EXTERN_METHOD(stopTimer:(NSString *)id)
RCT_EXTERN_METHOD(resetTimer:(NSString *)id)
RCT_EXTERN_METHOD(destroyTimer:(NSString *)id)

// ── Synchronous state queries ─────────────────────────────────────────────

RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD(getTimerState:(NSString *)id)
RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD(getPersistedTimers)
RCT_EXTERN__BLOCKING_SYNCHRONOUS_METHOD(canScheduleExactAlarms)

// ── Permissions ────────────────────────────────────────────────────────────

RCT_EXTERN_METHOD(requestExactAlarmPermission)

// ── Legacy API ─────────────────────────────────────────────────────────────

RCT_EXTERN_METHOD(legacySetTimeout:(double)callbackId delay:(double)delay)
RCT_EXTERN_METHOD(legacySetInterval:(double)callbackId interval:(double)interval)
RCT_EXTERN_METHOD(legacyClear:(double)callbackId)
