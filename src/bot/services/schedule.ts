/**
 * When a scheduled summary is due.
 *
 * Pure functions, so the decision can be tested without a bot or a clock.
 *
 * The previous check only fired when the hourly tick happened to land in the
 * first five minutes of the scheduled hour. Ticks are anchored to process
 * start, so a bot started at 10:37 ticked at :37 forever and never matched.
 * This version asks a question that does not depend on when the tick lands:
 * "has the most recent scheduled instant passed without a run since?"
 */

export interface ScheduleSettings {
  scheduledEnabled: boolean;
  /** 'daily' or 'weekly' */
  frequency: string;
  /** 'HH:MM' or 'HH:MM:SS', as Postgres returns a TIME column */
  time: string;
  /** IANA zone name; anything Intl rejects falls back to UTC */
  timezone: string;
  lastRun: Date | null;
}

/** Weekly summaries go out on Sunday, local time. */
export const WEEKLY_DAY = 0;

/**
 * A slot missed by more than this is skipped rather than posted late. A daily
 * summary that arrives six hours after its time is still that day's summary;
 * one that arrives the next morning is just confusing.
 */
export const GRACE_MS = 6 * 60 * 60 * 1000;

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
  };
}

/** The UTC instant of a wall-clock time in a zone. Two passes cover DST edges. */
function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const seen = localParts(new Date(guess), timeZone);
    const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
    const offset = seenAsUtc - guess;
    guess = target - offset;
  }
  return new Date(guess);
}

function safeZone(timezone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch {
    return 'UTC';
  }
}

/**
 * The most recent instant at which this schedule should have fired, at or
 * before `now`. Null when the settings cannot be read.
 */
export function lastDueInstant(settings: ScheduleSettings, now: Date): Date | null {
  const [hourText, minuteText] = (settings.time || '09:00').split(':');
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText ?? '0', 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

  const zone = safeZone(settings.timezone || 'UTC');
  const today = localParts(now, zone);
  const weekly = settings.frequency === 'weekly';

  // Walk back day by day from today (local) until the slot is in the past and,
  // for weekly schedules, on the right weekday. Eight days always suffices.
  for (let back = 0; back < 8; back++) {
    const calendar = new Date(Date.UTC(today.year, today.month - 1, today.day - back));
    if (weekly && calendar.getUTCDay() !== WEEKLY_DAY) continue;

    const instant = zonedToUtc(
      calendar.getUTCFullYear(),
      calendar.getUTCMonth() + 1,
      calendar.getUTCDate(),
      hour,
      minute,
      zone
    );
    if (instant.getTime() <= now.getTime()) return instant;
  }
  return null;
}

/** True when the schedule should fire right now. */
export function isScheduleDue(settings: ScheduleSettings, now: Date): boolean {
  if (!settings.scheduledEnabled) return false;

  const due = lastDueInstant(settings, now);
  if (!due) return false;

  if (now.getTime() - due.getTime() > GRACE_MS) return false;

  if (settings.lastRun && settings.lastRun.getTime() >= due.getTime()) return false;

  return true;
}
