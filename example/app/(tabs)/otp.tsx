/**
 * OTP Expiry Screen
 *
 * Demonstrates a short-lived timer use case — OTP codes that expire in
 * 30–120 seconds. Shows the legacy API (setTimeout) for simplicity,
 * alongside the hook API for the countdown display.
 */

import React, { useState, useCallback } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useBackgroundTimer } from '@rick427/react-native-bg-timer';
import { TimerRing, formatMs } from '../../src/components/TimerRing';
import { StatusBadge } from '../../src/components/StatusBadge';
import { COLORS, RADIUS } from '../../src/theme';

const OTP_DURATION = 90_000; // 90 seconds

function generateOTP(): string {
  return Math.floor(100_000 + Math.random() * 900_000).toString();
}

export default function OTPScreen() {
  const [otp, setOtp] = useState<string | null>(null);
  const [isExpired, setIsExpired] = useState(false);

  const handleExpiry = useCallback(() => {
    setOtp(null);
    setIsExpired(true);
  }, []);

  const {
    start, stop,
    remaining, status, isBackground,
  } = useBackgroundTimer({
    id: 'otp-expiry',
    duration: OTP_DURATION,
    tickInterval: 1000,
    persist: false,    // OTP codes don't need to persist across kills

    onComplete: handleExpiry,

    android: {
      title: 'OTP Active',
      text: 'Your one-time password expires soon',
      importance: 'low',
      color: '#F59E0B',
    },
  });

  const progress = remaining / OTP_DURATION;

  // Color urgency
  const ringColor =
    remaining > 60_000 ? COLORS.success :
    remaining > 30_000 ? COLORS.warning :
    COLORS.danger;

  const handleGenerate = () => {
    setOtp(generateOTP());
    setIsExpired(false);
    start();
  };

  const handleCancel = () => {
    stop();
    setOtp(null);
    setIsExpired(false);
  };

  const isActive = status === 'running';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>OTP Timer</Text>
          <Text style={styles.subtitle}>90-second expiry • Background safe</Text>
        </View>

        {/* OTP display */}
        {otp && !isExpired ? (
          <View style={styles.otpCard}>
            <Text style={styles.otpLabel}>Your one-time password</Text>
            <Text style={styles.otpCode}>{otp}</Text>
            <Text style={styles.otpHint}>
              Do not share this code with anyone.
            </Text>
          </View>
        ) : isExpired ? (
          <View style={styles.expiredCard}>
            <Ionicons name="close-circle" size={32} color={COLORS.danger} />
            <Text style={styles.expiredTitle}>Code Expired</Text>
            <Text style={styles.expiredHint}>Generate a new OTP to continue</Text>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="keypad-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No active OTP</Text>
          </View>
        )}

        {/* Timer ring */}
        {isActive && (
          <View style={styles.ringContainer}>
            <TimerRing
              progress={progress}
              label={formatMs(remaining)}
              subLabel="Until expiry"
              size={200}
              strokeWidth={10}
              color={ringColor}
            />
            <View style={styles.statusRow}>
              <StatusBadge status={status} isBackground={isBackground} />
            </View>
          </View>
        )}

        {/* Controls */}
        <View style={styles.controls}>
          {!isActive ? (
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={handleGenerate}>
              <Ionicons name="refresh" size={20} color="#fff" />
              <Text style={styles.btnText}>Generate OTP</Text>
            </Pressable>
          ) : (
            <Pressable style={[styles.btn, styles.btnDanger]} onPress={handleCancel}>
              <Ionicons name="close" size={20} color="#fff" />
              <Text style={styles.btnText}>Cancel OTP</Text>
            </Pressable>
          )}
        </View>

        {/* Info card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={18} color={COLORS.primary} />
          <Text style={styles.infoText}>
            The countdown continues even if you switch apps. The OTP will be
            invalidated automatically when the timer reaches zero — no manual
            server call needed on the client side.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  header: { paddingTop: 20, marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },

  otpCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
  },
  otpLabel: { fontSize: 13, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  otpCode: { fontSize: 44, fontWeight: '800', color: COLORS.text, letterSpacing: 8, fontFamily: 'Courier' },
  otpHint: { fontSize: 12, color: COLORS.textMuted, marginTop: 12, textAlign: 'center' },

  expiredCard: {
    backgroundColor: '#450A0A',
    borderRadius: RADIUS.lg,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.danger,
    marginBottom: 24,
    gap: 8,
  },
  expiredTitle: { fontSize: 20, fontWeight: '700', color: COLORS.danger },
  expiredHint: { fontSize: 13, color: COLORS.textMuted },

  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 40,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 24,
    gap: 12,
  },
  emptyText: { fontSize: 16, color: COLORS.textMuted },

  ringContainer: { alignItems: 'center', marginBottom: 24 },
  statusRow: { marginTop: 12 },

  controls: { marginBottom: 24 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15, borderRadius: RADIUS.lg,
  },
  btnPrimary: { backgroundColor: COLORS.primary },
  btnDanger: { backgroundColor: '#7F1D1D', borderWidth: 1, borderColor: COLORS.danger },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  infoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#1E1B4B', borderRadius: RADIUS.md, padding: 14,
    borderWidth: 1, borderColor: '#3730A3',
  },
  infoText: { color: COLORS.textSecondary, fontSize: 13, flex: 1, lineHeight: 20 },
});
