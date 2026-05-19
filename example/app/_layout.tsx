import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { BackgroundTimer } from '@rick427/react-native-bg-timer';

export default function RootLayout() {
  useEffect(() => {
    /**
     * On every app launch, check for timers that completed while the app
     * was killed. This is the persistence feature in action.
     *
     * In a real fintech app you'd use this to force-logout the user
     * even if they killed the app while a session-timeout timer was running.
     */
    const persisted = BackgroundTimer.getPersistedTimers();
    const expiredSession = persisted.find(
      (t) => t.id === 'session-timeout' && t.status === 'completed'
    );

    if (expiredSession) {
      console.log(
        '[BGTimer] Session expired while app was killed at:',
        new Date(expiredSession.completedAt ?? 0).toISOString()
      );
      // In a real app: dispatch logout action, clear auth tokens, etc.
    }
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
