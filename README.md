# @rick427/react-native-bg-timer

A modern, reliable React Native background timer that keeps running even when your app is backgrounded or the screen is locked.

Built for **React Native New Architecture** (Turbo Modules + JSI) with **Kotlin** on Android and **Swift** on iOS.

[![CI](https://github.com/rick427/react-native-background-timer/actions/workflows/ci.yml/badge.svg)](https://github.com/rick427/react-native-background-timer/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@rick427/react-native-bg-timer)](https://www.npmjs.com/package/@rick427/react-native-bg-timer)
[![license](https://img.shields.io/npm/l/@rick427/react-native-bg-timer)](LICENSE)
[![platforms](https://img.shields.io/badge/platforms-iOS%20%7C%20Android-lightgrey)](https://github.com/rick427/react-native-background-timer)

---

## Why this exists

The most popular background timer package ([react-native-background-timer](https://www.npmjs.com/package/react-native-background-timer)) is unmaintained and has a number of unfixed issues:

| Problem | This package |
|---|---|
| Android timer dies after ~10s on locked screen (Doze mode) | ✅ Foreground Service + `setExactAndAllowWhileIdle()` pierces Doze |
| iOS only gets ~30s of background time | ✅ `BGTaskScheduler` layered with `UIBackgroundTask` for long timers |
| `clearTimeout` doesn't actually stop the background task | ✅ Cancellation propagated all the way to native |
| Only one timer at a time on iOS | ✅ Full multi-timer support with named string IDs |
| New Architecture broken (Hermes crash, no Turbo Module) | ✅ Built on Turbo Modules + JSI from day one |
| Java + Objective-C | ✅ Kotlin + Swift |
| No TypeScript | ✅ Fully typed — types generated from the Turbo Module spec |
| No React hook | ✅ `useBackgroundTimer()` |
| No Expo support | ✅ Config plugin auto-configures native projects |
| No persistence across app kills | ✅ Persisted to disk — check on relaunch |

---

## Platform requirements

| Platform | Minimum |
|---|---|
| iOS | 13.0 (BGTaskScheduler) |
| Android | 8.0 / API 26 (Foreground Services, notification channels) |
| React Native | 0.71+ (New Architecture) |

---

## Installation

```sh
npm install @rick427/react-native-bg-timer
# or
yarn add @rick427/react-native-bg-timer
```

### Expo (managed workflow)

Add the config plugin to your `app.json` / `app.config.js`:

```json
{
  "plugins": [
    [
      "@rick427/react-native-bg-timer",
      {
        "taskIdentifiers": [
          "com.yourapp.session-timeout",
          "com.yourapp.otp-expiry"
        ]
      }
    ]
  ]
}
```

Then rebuild:

```sh
expo prebuild
expo run:ios
expo run:android
```

### Bare React Native

**iOS** — add to `Info.plist`:

```xml
<key>UIBackgroundModes</key>
<array>
  <string>processing</string>
  <string>fetch</string>
</array>
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
  <string>com.rick427.backgroundtimer.processing</string>
  <!-- add your own task identifiers here -->
</array>
```

**Android** — the library's `AndroidManifest.xml` is merged automatically by AGP. No manual steps needed.

**Android 12+ (API 31+)** — exact alarm permission must be granted by the user. See [Permissions](#-android-12-exact-alarm-permission) below.

---

## Quick start

```tsx
import { useBackgroundTimer } from '@rick427/react-native-bg-timer';

function SessionScreen() {
  const { start, stop, pause, resume, remaining, status } = useBackgroundTimer({
    id: 'session-timeout',
    duration: 5 * 60 * 1000,          // 5 minutes
    tickInterval: 1000,                // update every second
    onComplete: () => logoutUser(),    // fires even if app is in background
    onBackground: () => console.log('timer running in background'),
    android: {
      title: 'Session Active',
      text: 'Your banking session is running',
      color: '#6366F1',
    },
  });

  return (
    <View>
      <Text>{Math.ceil(remaining / 1000)}s remaining</Text>
      <Text>Status: {status}</Text>
      <Button onPress={start}   title="Start"  />
      <Button onPress={pause}   title="Pause"  />
      <Button onPress={resume}  title="Resume" />
      <Button onPress={stop}    title="Stop"   />
    </View>
  );
}
```

---

## API

### `useBackgroundTimer(options)` — Hook

The recommended way to use timers in functional components.

```ts
const {
  start,        // () => void
  pause,        // () => void
  resume,       // () => void
  stop,         // () => void
  reset,        // () => void — reset to full duration without stopping
  elapsed,      // number (ms)
  remaining,    // number (ms)
  status,       // 'idle' | 'running' | 'paused' | 'completed' | 'stopped'
  isBackground, // boolean — is the app currently backgrounded?
  error,        // BackgroundTimerError | null
} = useBackgroundTimer(options);
```

#### Options

```ts
interface UseBackgroundTimerOptions {
  id?: string;               // stable ID — defaults to a generated UUID
  duration: number;          // total timer duration in ms
  tickInterval?: number;     // how often onTick fires (ms). Default: 1000
  persist?: boolean;         // persist to disk across app kills. Default: true
  autoStart?: boolean;       // start immediately on mount. Default: false

  onComplete?: () => void;
  onTick?: (elapsed: number, remaining: number) => void;
  onBackground?: () => void;
  onForeground?: () => void;
  onError?: (error: BackgroundTimerError) => void;

  android?: AndroidNotificationConfig;
  ios?: IOSConfig;
}
```

---

### `BackgroundTimer.create(options)` — Imperative API

For cases where you need to manage timers outside of React components.

```ts
import { BackgroundTimer } from '@rick427/react-native-bg-timer';

const timer = BackgroundTimer.create({
  id: 'my-timer',
  duration: 10_000,
  onComplete: () => console.log('done'),
  onTick: (elapsed, remaining) => console.log(remaining),
});

timer.start();
timer.pause();
timer.resume();
timer.stop();
timer.reset();
timer.getState();  // → TimerState
timer.destroy();   // release all native resources
```

---

### `BackgroundTimer.setTimeout / setInterval` — Legacy API

Drop-in replacements for the standard JS timers. Use these if you're migrating from `react-native-background-timer`.

```ts
import { BackgroundTimer } from '@rick427/react-native-bg-timer';

// One-shot
const timeoutId = BackgroundTimer.setTimeout(() => {
  logoutUser();
}, 5 * 60 * 1000);

BackgroundTimer.clearTimeout(timeoutId);

// Repeating
const intervalId = BackgroundTimer.setInterval(() => {
  refreshAuthToken();
}, 30_000);

BackgroundTimer.clearInterval(intervalId);
```

---

### Persistence — check on relaunch

```ts
// In your app's root component or startup logic:
const persisted = BackgroundTimer.getPersistedTimers();

const expiredSession = persisted.find(
  (t) => t.id === 'session-timeout' && t.status === 'completed'
);

if (expiredSession) {
  // Timer completed while the app was killed — force logout
  logoutUser();
}
```

---

### Android notification config

A foreground service notification is **required** on Android 8+ to keep timers running reliably. Configure it to match your app's design:

```ts
useBackgroundTimer({
  // ...
  android: {
    title: 'Session Active',
    text: 'Your banking session is running. Tap to return.',
    icon: 'ic_notification',    // drawable resource name
    color: '#6366F1',           // hex accent color
    importance: 'low',          // 'none' | 'min' | 'low' | 'default' | 'high'
    channelId: 'session_timer', // change to create a new notification channel
    channelName: 'Session Timers',
  },
});
```

---

### Android 12+ exact alarm permission

Android 12 (API 31) introduced `SCHEDULE_EXACT_ALARM` — users must grant it manually. Without it, the library falls back to inexact alarms (which can drift by minutes).

```ts
import { BackgroundTimer } from '@rick427/react-native-bg-timer';

// Check before starting a time-sensitive timer
if (!BackgroundTimer.canScheduleExactAlarms()) {
  Alert.alert(
    'Permission required',
    'For accurate background timers, please grant Alarms & Reminders permission.',
    [
      { text: 'Skip', onPress: startTimer },
      {
        text: 'Open Settings',
        onPress: () => BackgroundTimer.requestExactAlarmPermission(),
      },
    ]
  );
}
```

---

## Types

```ts
type TimerStatus = 'idle' | 'running' | 'paused' | 'completed' | 'stopped';

interface TimerState {
  id: string;
  status: TimerStatus;
  duration: number;
  elapsed: number;
  remaining: number;
  startedAt: number | null;
  completedAt: number | null;
  pausedAt: number | null;
}

interface BackgroundTimerError {
  code:
    | 'PERMISSION_DENIED'   // exact alarm permission not granted
    | 'SERVICE_FAILED'      // foreground service could not start
    | 'TASK_EXPIRED'        // iOS background task expired
    | 'TIMER_NOT_FOUND'     // operation on non-existent timer ID
    | 'ALREADY_RUNNING'     // tried to start a running timer
    | 'UNKNOWN';
  message: string;
  timerId?: string;
}
```

---

## How it works

### Android

```
JS → Turbo Module → Foreground Service (Notification + PARTIAL_WAKE_LOCK)
                          └─► AlarmManager.setExactAndAllowWhileIdle()
                                    └─► AlarmReceiver (BroadcastReceiver)
                                              └─► emit tick / complete → JS
```

- **Foreground Service** keeps the process alive — Android cannot kill it arbitrarily
- **`setExactAndAllowWhileIdle()`** pierces through Doze mode to fire at the exact time
- **`PARTIAL_WAKE_LOCK`** prevents the CPU from sleeping between alarm fires
- **Wall-clock drift correction** — uses `System.currentTimeMillis()` delta instead of trusting the alarm, so elapsed time is always accurate even if the alarm fires late
- **Boot receiver** reconciles persisted timers after a device reboot

### iOS

```
JS → Turbo Module → UIApplication.beginBackgroundTask (~30s)
                  → BGTaskScheduler.submit(BGProcessingTask)  (longer timers)
                          └─► RunLoop Timer (fires on each tick)
                                    └─► emit tick / complete → JS
```

- **`UIBackgroundTask`** keeps execution alive for up to ~30 seconds immediately after backgrounding
- **`BGProcessingTask`** (iOS 13+) is registered for timers longer than 30s — iOS wakes the app before the deadline
- **Wall-clock correction** — `Date().timeIntervalSince1970` delta used on each tick, not trusted timer intervals
- **`UserDefaults` persistence** — timer state survives app kills

---

## Example app

The `example/` directory contains a full Expo app with three screens:

- **Session Timeout** — 5-min fintech session with persistence, exact alarm check, and Android notification config
- **OTP Expiry** — 90-second OTP countdown with urgency colour transitions
- **API Playground** — three concurrent timers using hook / imperative / legacy APIs simultaneously

```sh
cd example
yarn install
yarn ios     # or: yarn android
```

---

## Contributing

PRs and issues welcome. Please open an issue before submitting large changes.

```sh
# Clone and install
git clone https://github.com/rick427/react-native-background-timer
cd react-native-background-timer
yarn install

# Typecheck
yarn typecheck

# Lint
yarn lint

# Build
yarn build
```

---

## License

MIT © [rick427](https://github.com/rick427)
