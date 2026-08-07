/**
 * Builds fixture timestamps at *local* midday.
 *
 * The app deliberately works in local calendar days — `today()` returns the
 * user's date, and `differenceInCalendarDays` compares local days — which is
 * the right behaviour for a date-only tracker. Tests that pin a UTC instant
 * instead ("2026-08-10T12:00:00.000Z") therefore quietly encode the runner's
 * offset: the same suite passed in CEST and failed in UTC+14, where midday
 * UTC is already the next calendar day.
 *
 * Midday rather than midnight so a DST shift can't move the date either.
 */
export function localNoon(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

/** Same instant as `localNoon`, as the ISO string the data model stores. */
export function localNoonISO(year: number, month: number, day: number): string {
  return localNoon(year, month, day).toISOString()
}
