import { describe, it, expect } from 'vitest';
import { detectScheduleType, computeNextRun } from '../../src/scheduler/parse.js';

describe('detectScheduleType', () => {
  it('returns { type: "cron" } for a valid cron expression', () => {
    const result = detectScheduleType('0 * * * *');
    expect(result).toEqual({ type: 'cron' });
  });

  it('throws with "invalid schedule" for an invalid expression', () => {
    expect(() => detectScheduleType('not-a-cron')).toThrow('invalid schedule');
  });
});

describe('computeNextRun', () => {
  it('returns a future ISO string for a cron task', () => {
    const result = computeNextRun({
      schedule_type: 'cron',
      schedule_value: '0 * * * *',
      normalized_ms: null,
      next_run: null,
    });
    expect(typeof result).toBe('string');
    expect(new Date(result!).getTime()).toBeGreaterThan(Date.now());
  });
});
