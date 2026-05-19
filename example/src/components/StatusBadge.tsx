import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../theme';
import type { TimerStatus } from '@rick427/react-native-bg-timer';

interface Props {
  status: TimerStatus;
  isBackground?: boolean;
}

const CONFIG: Record<TimerStatus, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  idle:      { label: 'Idle',      color: COLORS.textMuted,  icon: 'ellipse-outline' },
  running:   { label: 'Running',   color: COLORS.success,    icon: 'play-circle' },
  paused:    { label: 'Paused',    color: COLORS.warning,    icon: 'pause-circle' },
  completed: { label: 'Completed', color: COLORS.primary,    icon: 'checkmark-circle' },
  stopped:   { label: 'Stopped',   color: COLORS.danger,     icon: 'stop-circle' },
};

export function StatusBadge({ status, isBackground }: Props) {
  const cfg = CONFIG[status];

  return (
    <View style={styles.row}>
      <View style={[styles.badge, { borderColor: cfg.color }]}>
        <Ionicons name={cfg.icon} size={14} color={cfg.color} />
        <Text style={[styles.label, { color: cfg.color }]}>{cfg.label}</Text>
      </View>

      {isBackground && (
        <View style={styles.bgBadge}>
          <Ionicons name="moon" size={12} color={COLORS.warning} />
          <Text style={styles.bgLabel}>Background</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    backgroundColor: COLORS.surface,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  bgBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: '#451A03',
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  bgLabel: {
    fontSize: 11,
    color: COLORS.warning,
    fontWeight: '600',
  },
});
