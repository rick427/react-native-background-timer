/**
 * API Playground Screen
 *
 * Shows all three API styles running simultaneously:
 *  1. useBackgroundTimer hook  (Timer A)
 *  2. BackgroundTimer.create() imperative  (Timer B)
 *  3. BackgroundTimer.setTimeout() legacy  (Timer C)
 *
 * Good for verifying multiple concurrent timers don't interfere.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  BackgroundTimer,
  useBackgroundTimer,
  type TimerHandle,
  type LegacyTimeoutId,
} from '@rick427/react-native-bg-timer';
import { StatusBadge } from '../../src/components/StatusBadge';
import { formatMs } from '../../src/components/TimerRing';
import { COLORS, RADIUS } from '../../src/theme';

const TIMER_A_DURATION = 20_000;
const TIMER_B_DURATION = 45_000;
const LEGACY_DELAY     = 10_000;

export default function PlaygroundScreen() {
  // ── Timer A: Hook API ────────────────────────────────────────────────────
  const [aLog, setALog] = useState<string[]>([]);

  const timerA = useBackgroundTimer({
    id: 'playground-hook',
    duration: TIMER_A_DURATION,
    tickInterval: 1000,
    persist: false,
    onComplete: () => addLog(setALog, '✅ Completed'),
    onBackground: () => addLog(setALog, '🌙 Went background'),
    onForeground: () => addLog(setALog, '☀️ Returned foreground'),
  });

  // ── Timer B: Imperative API ───────────────────────────────────────────────
  const handleB = useRef<TimerHandle | null>(null);
  const [bStatus, setBStatus] = useState<string>('idle');
  const [bRemaining, setBRemaining] = useState(TIMER_B_DURATION);
  const [bLog, setBLog] = useState<string[]>([]);

  useEffect(() => {
    handleB.current = BackgroundTimer.create({
      id: 'playground-imperative',
      duration: TIMER_B_DURATION,
      tickInterval: 1000,
      persist: false,
      onTick: (_, remaining) => {
        setBRemaining(remaining);
      },
      onComplete: () => {
        setBStatus('completed');
        addLog(setBLog, '✅ Completed');
      },
    });
    return () => handleB.current?.destroy();
  }, []);

  // ── Timer C: Legacy setTimeout API ───────────────────────────────────────
  const legacyIdRef = useRef<LegacyTimeoutId | null>(null);
  const [cLog, setCLog] = useState<string[]>([]);
  const [cFired, setCFired] = useState(false);
  const [cRunning, setCRunning] = useState(false);

  const startLegacy = () => {
    if (legacyIdRef.current) return;
    addLog(setCLog, `⏱ Started ${LEGACY_DELAY / 1000}s timeout`);
    setCFired(false);
    setCRunning(true);
    legacyIdRef.current = BackgroundTimer.setTimeout(() => {
      addLog(setCLog, '✅ Timeout fired!');
      setCFired(true);
      setCRunning(false);
      legacyIdRef.current = null;
    }, LEGACY_DELAY);
  };

  const cancelLegacy = () => {
    if (legacyIdRef.current == null) return;
    BackgroundTimer.clearTimeout(legacyIdRef.current);
    legacyIdRef.current = null;
    setCRunning(false);
    addLog(setCLog, '🛑 Cancelled');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>API Playground</Text>
        <Text style={styles.subtitle}>Three timers running concurrently</Text>

        {/* ── Timer A ── */}
        <TimerCard
          label="A — Hook API"
          badge={<StatusBadge status={timerA.status} isBackground={timerA.isBackground} />}
          time={formatMs(timerA.remaining)}
          progress={timerA.remaining / TIMER_A_DURATION}
          log={aLog}
        >
          <View style={styles.btnRow}>
            <ActionBtn icon="play" label="Start" onPress={timerA.start} color={COLORS.success} />
            <ActionBtn icon="pause" label="Pause" onPress={timerA.pause} color={COLORS.warning} />
            <ActionBtn icon="play-skip-forward" label="Resume" onPress={timerA.resume} color={COLORS.primary} />
            <ActionBtn icon="stop" label="Stop" onPress={timerA.stop} color={COLORS.danger} />
            <ActionBtn icon="refresh" label="Reset" onPress={timerA.reset} color={COLORS.textMuted} />
          </View>
        </TimerCard>

        {/* ── Timer B ── */}
        <TimerCard
          label="B — Imperative API"
          badge={<StatusBadge status={bStatus as any} />}
          time={formatMs(bRemaining)}
          progress={bRemaining / TIMER_B_DURATION}
          log={bLog}
        >
          <View style={styles.btnRow}>
            <ActionBtn icon="play" label="Start" color={COLORS.success}
              onPress={() => { handleB.current?.start(); setBStatus('running'); addLog(setBLog, '▶️ Started'); }} />
            <ActionBtn icon="pause" label="Pause" color={COLORS.warning}
              onPress={() => { handleB.current?.pause(); setBStatus('paused'); addLog(setBLog, '⏸ Paused'); }} />
            <ActionBtn icon="stop" label="Stop" color={COLORS.danger}
              onPress={() => { handleB.current?.stop(); setBStatus('stopped'); setBRemaining(TIMER_B_DURATION); addLog(setBLog, '⏹ Stopped'); }} />
          </View>
        </TimerCard>

        {/* ── Timer C ── */}
        <TimerCard
          label="C — Legacy setTimeout"
          badge={
            <View style={[styles.legacyBadge, { borderColor: cFired ? COLORS.success : cRunning ? COLORS.warning : COLORS.textMuted }]}>
              <Text style={[styles.legacyBadgeText, { color: cFired ? COLORS.success : cRunning ? COLORS.warning : COLORS.textMuted }]}>
                {cFired ? 'Fired' : cRunning ? 'Waiting…' : 'Idle'}
              </Text>
            </View>
          }
          time={cRunning ? '10s' : '—'}
          progress={cRunning ? 0.5 : 0}
          log={cLog}
        >
          <View style={styles.btnRow}>
            <ActionBtn icon="timer" label="Start 10s" color={COLORS.primary} onPress={startLegacy} />
            <ActionBtn icon="close" label="Cancel" color={COLORS.danger} onPress={cancelLegacy} />
          </View>
        </TimerCard>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TimerCard({
  label, badge, time, progress, log, children,
}: {
  label: string;
  badge: React.ReactNode;
  time: string;
  progress: number;
  log: string[];
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardLabel}>{label}</Text>
        {badge}
      </View>

      {/* Mini progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(1, progress)) * 100}%` }]} />
      </View>
      <Text style={styles.cardTime}>{time}</Text>

      {children}

      {/* Event log */}
      {log.length > 0 && (
        <View style={styles.log}>
          {[...log].reverse().slice(0, 4).map((entry, i) => (
            <Text key={i} style={styles.logEntry}>{entry}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

function ActionBtn({
  icon, label, onPress, color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  color: string;
}) {
  return (
    <Pressable style={styles.actionBtn} onPress={onPress}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

function addLog(setter: React.Dispatch<React.SetStateAction<string[]>>, entry: string) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  setter((prev) => [...prev, `${time}  ${entry}`]);
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.text, paddingTop: 20 },
  subtitle: { fontSize: 13, color: COLORS.textMuted, marginBottom: 20, marginTop: 2 },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  cardTime: {
    fontFamily: 'Courier',
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.text,
  },
  progressTrack: {
    height: 4,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },

  btnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceAlt,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },

  log: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm,
    padding: 10,
    gap: 3,
  },
  logEntry: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontFamily: 'Courier',
  },

  legacyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  legacyBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
