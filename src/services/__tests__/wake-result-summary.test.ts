import { describe, expect, it } from 'vitest';

import {
  formatAlarmTimeLabel,
  formatElapsedLabel,
} from '../wake-result-summary';

describe('formatAlarmTimeLabel', () => {
  it('formats an ISO timestamp as HH:MM in local time', () => {
    const date = new Date();
    date.setHours(7, 5, 0, 0);

    expect(formatAlarmTimeLabel(date.toISOString())).toBe('07:05');
  });

  it('returns a placeholder for an invalid timestamp', () => {
    expect(formatAlarmTimeLabel('not-a-date')).toBe('--:--');
  });
});

describe('formatElapsedLabel', () => {
  it('formats the gap between firedAt and now as M:SS', () => {
    const firedAt = new Date('2026-08-28T07:00:00.000Z');
    const now = new Date('2026-08-28T07:01:42.000Z');

    expect(formatElapsedLabel(firedAt.toISOString(), now)).toBe('1:42');
  });

  it('clamps a negative gap to 0:00', () => {
    const firedAt = new Date('2026-08-28T07:05:00.000Z');
    const now = new Date('2026-08-28T07:00:00.000Z');

    expect(formatElapsedLabel(firedAt.toISOString(), now)).toBe('0:00');
  });

  it('returns null for an invalid timestamp', () => {
    expect(formatElapsedLabel('not-a-date')).toBeNull();
  });
});
