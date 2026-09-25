import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isScheduleDue, lastDueInstant, ScheduleSettings } from './schedule';

const daily = (over: Partial<ScheduleSettings> = {}): ScheduleSettings => ({
  scheduledEnabled: true,
  frequency: 'daily',
  time: '09:00:00',
  timezone: 'UTC',
  lastRun: null,
  ...over,
});

describe('lastDueInstant', () => {
  test('is today when the time has passed', () => {
    const due = lastDueInstant(daily(), new Date('2026-09-26T10:15:00Z'));
    assert.equal(due?.toISOString(), '2026-09-26T09:00:00.000Z');
  });

  test('is yesterday when the time has not come yet', () => {
    const due = lastDueInstant(daily(), new Date('2026-09-26T08:59:00Z'));
    assert.equal(due?.toISOString(), '2026-09-25T09:00:00.000Z');
  });

  test('honours the group timezone', () => {
    // 09:00 in Addis Ababa (UTC+3) is 06:00 UTC.
    const due = lastDueInstant(
      daily({ timezone: 'Africa/Addis_Ababa' }),
      new Date('2026-09-26T06:30:00Z')
    );
    assert.equal(due?.toISOString(), '2026-09-26T06:00:00.000Z');
  });

  test('handles a DST zone', () => {
    // London is on BST (UTC+1) in September.
    const due = lastDueInstant(
      daily({ timezone: 'Europe/London' }),
      new Date('2026-09-26T12:00:00Z')
    );
    assert.equal(due?.toISOString(), '2026-09-26T08:00:00.000Z');
  });

  test('weekly picks the most recent Sunday', () => {
    // 2026-09-26 is a Saturday; the previous Sunday is the 20th.
    const due = lastDueInstant(daily({ frequency: 'weekly' }), new Date('2026-09-26T12:00:00Z'));
    assert.equal(due?.toISOString(), '2026-09-20T09:00:00.000Z');
  });

  test('falls back to UTC for an unknown zone', () => {
    const due = lastDueInstant(
      daily({ timezone: 'Mars/Olympus' }),
      new Date('2026-09-26T10:00:00Z')
    );
    assert.equal(due?.toISOString(), '2026-09-26T09:00:00.000Z');
  });
});

describe('isScheduleDue', () => {
  test('is off when scheduling is disabled', () => {
    assert.equal(
      isScheduleDue(daily({ scheduledEnabled: false }), new Date('2026-09-26T09:01:00Z')),
      false
    );
  });

  // Regression: the old check needed the tick to land in the first five
  // minutes of the hour. A tick at :37 must still fire.
  test('fires at any point after the slot, not only in the first minutes', () => {
    assert.equal(isScheduleDue(daily(), new Date('2026-09-26T09:37:00Z')), true);
  });

  test('does not fire twice for the same slot', () => {
    const settings = daily({ lastRun: new Date('2026-09-26T09:02:00Z') });
    assert.equal(isScheduleDue(settings, new Date('2026-09-26T09:37:00Z')), false);
  });

  test('fires again the next day', () => {
    const settings = daily({ lastRun: new Date('2026-09-26T09:02:00Z') });
    assert.equal(isScheduleDue(settings, new Date('2026-09-27T09:00:30Z')), true);
  });

  test('skips a slot missed by more than the grace period', () => {
    assert.equal(isScheduleDue(daily(), new Date('2026-09-26T16:00:00Z')), false);
  });

  test('weekly waits for Sunday', () => {
    const settings = daily({ frequency: 'weekly', lastRun: new Date('2026-09-20T09:01:00Z') });
    assert.equal(isScheduleDue(settings, new Date('2026-09-26T09:30:00Z')), false);
    assert.equal(isScheduleDue(settings, new Date('2026-09-27T09:30:00Z')), true);
  });
});
