/**
 * Session Timeout Screen
 *
 * Demonstrates the primary fintech use case:
 *  - User logs in → session timer starts
 *  - App goes to background → timer keeps counting
 *  - Timer hits zero → user is logged out (even if app is in background)
 *  - App returns to foreground → shows the expired/remaining state
 *
 * Also demonstrates:
 *  - Android exact alarm permission check
 *  - Persisted timer check on mount
 *  - onBackground / onForeground callbacks
 *  - Customizable Android notification
 */

import React, { useState, useCallback } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBackgroundTimer, BackgroundTimer } from '@rick427/react-native-bg-timer';
import { TimerRing, formatMs } from '../../src/components/TimerRing';
import { StatusBadge } from '../../src/components/StatusBadge';
import { COLORS, RADIUS } from '../../src/theme';

// 5-minute session timeout
const SESSION_DURATION = 5 * 60 * 1000;

// Duration options for demo purposes
const DURATION_OPTIONS = [
  { label: '30s',  value: 30_000 },
  { label: '1m',   value: 60_000 },
  { label: '5m',   value: 300_000 },
  { label: '10m',  value: 600_000 },
];

export default function SessionScreen() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState(SESSION_DURATION);
  const [loggedOutAt, setLoggedOutAt] = useState<Date | null>(null);

  const handleSessionExpiry = useCallback(() => {
    setIsLoggedIn(false);
    setLoggedOutAt(new Date());
    Alert.alert(
      '🔒 Session Expired',
      'Your session has timed out for security. Please log in again.',
      [{ text: 'OK' }]
    );
  }, []);

  const {
    start, stop, pause, resume, reset,
    remaining, elapsed, status, isBackground, error,
  } = useBackgroundTimer({
    id: 'session-timeout',
    duration: selectedDuration,
    tickInterval: 1000,
    persist: true,

    onComplete: handleSessionExpiry,

    onBackground: () => {
      console.log('[Session] App went to background — timer keeps running natively');
    },

    onForeground: () => {
      console.log('[Session] App returned to foreground');
    },

    onError: (err) => {
      if (err.code === 'PERMISSION_DENIED') {
        Alert.alert(
          '⚠️ Permission Required',
          'For precise background timers on Android 12+, please grant "Alarms & Reminders" permission.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => BackgroundTimer.requestExactAlarmPermission(),
            },
          ]
        );
      }
    },

    android: {
      title: 'Session Active',
      text: 'Your banking session is running. Tap to return.',
      icon: 'ic_notification',
      color: '#6366F1',
      importance: 'low',
    },
  });

  const progress = remaining / selectedDuration;
  const isActive = status === 'running' || status === 'paused';

  // Ring color changes as time runs out
  const ringColor =
    progress > 0.5 ? COLORS.success :
    progress > 0.2 ? COLORS.warning :
    COLORS.danger;

  const handleLogin = () => {
    // Check exact alarm permission on Android 12+
    if (Platform.OS === 'android' && !BackgroundTimer.canScheduleExactAlarms()) {
      Alert.alert(
        'Permission Needed',
        'For accurate session timeouts, please grant exact alarm permission.',
        [
          { text: 'Skip', onPress: () => doLogin() },
          {
            text: 'Grant',
            onPress: () => BackgroundTimer.requestExactAlarmPermission(),
          },
        ]
      );
      return;
    }
    doLogin();
  };

  const doLogin = () => {
    setIsLoggedIn(true);
    setLoggedOutAt(null);
    start();
  };

  const handleLogout = () => {
    stop();
    setIsLoggedIn(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Session Timer</Text>
            <Text style={styles.subtitle}>Background-safe • Persisted</Text>
          </View>
          <View style={[styles.dot, { backgroundColor: isLoggedIn ? COLORS.success : COLORS.textMuted }]} />
        </View>

        {/* ── Duration selector (only when not active) ── */}
        {!isActive && (
          <View style={styles.durationRow}>
            <Text style={styles.durationLabel}>Session length</Text>
            <View style={styles.durationOptions}>
              {DURATION_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[
                    styles.durationBtn,
                    selectedDuration === opt.value && styles.durationBtnActive,
                  ]}
                  onPress={() => setSelectedDuration(opt.value)}
                >
                  <Text
                    style={[
                      styles.durationBtnText,
                      selectedDuration === opt.value && styles.durationBtnTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* ── Timer ring ── */}
        <View style={styles.ringContainer}>
          <TimerRing
            progress={progress}
            label={formatMs(remaining)}
            subLabel={isBackground ? '● Running in background' : undefined}
            size={240}
            strokeWidth={12}
            color={ringColor}
          />
        </View>

        {/* ── Status badge ── */}
        <View style={styles.statusRow}>
          <StatusBadge status={status} isBackground={isBackground} />
        </View>

        {/* ── Error banner ── */}
        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="warning" size={16} color={COLORS.danger} />
            <Text style={styles.errorText}>{error.message}</Text>
          </View>
        )}

        {/* ── Logged out notice ── */}
        {loggedOutAt && !isLoggedIn && (
          <View style={styles.expiredCard}>
            <Ionicons name="lock-closed" size={20} color={COLORS.warning} />
            <Text style={styles.expiredText}>
              Session expired at {loggedOutAt.toLocaleTimeString()}
            </Text>
          </View>
        )}

        {/* ── Controls ── */}
        <View style={styles.controls}>
          {!isLoggedIn ? (
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={handleLogin}>
              <Ionicons name="log-in" size={20} color="#fff" />
              <Text style={styles.btnText}>Log In & Start Session</Text>
            </Pressable>
          ) : (
            <>
              <View style={styles.btnRow}>
                {status === 'running' ? (
                  <Pressable style={[styles.btn, styles.btnSecondary, styles.btnHalf]} onPress={pause}>
                    <Ionicons name="pause" size={18} color={COLORS.text} />
                    <Text style={styles.btnTextSecondary}>Pause</Text>
                  </Pressable>
                ) : (
                  <Pressable style={[styles.btn, styles.btnSecondary, styles.btnHalf]} onPress={resume}>
                    <Ionicons name="play" size={18} color={COLORS.text} />
                    <Text style={styles.btnTextSecondary}>Resume</Text>
                  </Pressable>
                )}
                <Pressable style={[styles.btn, styles.btnSecondary, styles.btnHalf]} onPress={reset}>
                  <Ionicons name="refresh" size={18} color={COLORS.text} />
                  <Text style={styles.btnTextSecondary}>Reset</Text>
                </Pressable>
              </View>

              <Pressable style={[styles.btn, styles.btnDanger]} onPress={handleLogout}>
                <Ionicons name="log-out" size={20} color="#fff" />
                <Text style={styles.btnText}>Log Out</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* ── Stats card ── */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Timer State</Text>
          <View style={styles.statsGrid}>
            <StatRow label="Elapsed"   value={formatMs(elapsed)} />
            <StatRow label="Remaining" value={formatMs(remaining)} />
            <StatRow label="Duration"  value={formatMs(selectedDuration)} />
            <StatRow label="Status"    value={status} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  durationRow: {
    marginBottom: 16,
  },
  durationLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  durationOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  durationBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  durationBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#312E81',
  },
  durationBtnText: {
    color: COLORS.textMuted,
    fontWeight: '600',
    fontSize: 13,
  },
  durationBtnTextActive: {
    color: COLORS.primaryLight,
  },
  ringContainer: {
    alignItems: 'center',
    marginVertical: 24,
  },
  statusRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#450A0A',
    borderColor: COLORS.danger,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 13,
    flex: 1,
  },
  expiredCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#451A03',
    borderColor: COLORS.warning,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: 14,
    marginBottom: 16,
  },
  expiredText: {
    color: COLORS.warning,
    fontSize: 14,
    fontWeight: '500',
  },
  controls: {
    gap: 10,
    marginBottom: 24,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: RADIUS.lg,
  },
  btnHalf: {
    flex: 1,
  },
  btnPrimary: {
    backgroundColor: COLORS.primary,
  },
  btnSecondary: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnDanger: {
    backgroundColor: '#7F1D1D',
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  btnTextSecondary: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 14,
  },
  statsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statsTitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  statsGrid: {
    gap: 8,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  statValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Courier',
  },
});
