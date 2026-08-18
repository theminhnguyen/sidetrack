import { addDays, addWeeks, differenceInCalendarDays, format, subDays } from 'date-fns'
import type { DateOnly, Timestamp } from '../types'

/**
 * Parses a YYYY-MM-DD string at local noon instead of UTC midnight.
 * `new Date("2026-08-15")` is parsed as UTC midnight, which renders as
 * Aug 14 in any timezone west of UTC — this avoids that off-by-one class of bugs.
 */
export function parseDateOnly(date: DateOnly): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0)
}

export function toDateOnly(date: Date): DateOnly {
  return format(date, 'yyyy-MM-dd')
}

export function today(): DateOnly {
  return toDateOnly(new Date())
}

/** Used for the snooze feature — always in whole weeks (+1w / +2w). */
export function addWeeksToDateOnly(date: DateOnly, weeks: number): DateOnly {
  return toDateOnly(addWeeks(parseDateOnly(date), weeks))
}

/** General-purpose day offset — used for seed data and ad-hoc date math. */
export function addDaysToDateOnly(date: DateOnly, days: number): DateOnly {
  return toDateOnly(addDays(parseDateOnly(date), days))
}

/** Lexicographic comparison is correct for YYYY-MM-DD strings. */
export function compareDateOnly(a: DateOnly, b: DateOnly): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function isBeforeDateOnly(a: DateOnly, b: DateOnly): boolean {
  return compareDateOnly(a, b) < 0
}

export function isAfterDateOnly(a: DateOnly, b: DateOnly): boolean {
  return compareDateOnly(a, b) > 0
}

export function isOverdue(dueDate: DateOnly): boolean {
  return isBeforeDateOnly(dueDate, today())
}

/** How many days late `dueDate` is. Only meaningful when `isOverdue` is true. */
export function daysOverdue(dueDate: DateOnly): number {
  return differenceInCalendarDays(parseDateOnly(today()), parseDateOnly(dueDate))
}

export function formatDateOnly(date: DateOnly): string {
  return format(parseDateOnly(date), 'MMM d')
}

export function nowTimestamp(): string {
  return new Date().toISOString()
}

export function timestampDaysAgo(days: number): string {
  return subDays(new Date(), days).toISOString()
}

export function formatTimestamp(timestamp: string): string {
  return format(new Date(timestamp), 'MMM d')
}


export function daysSince(timestamp: Timestamp): number {
  return differenceInCalendarDays(new Date(), new Date(timestamp))
}

/**
 * A capacity light nobody has touched in a fortnight is a claim about a
 * day job that has almost certainly moved on. Two weeks rather than one:
 * the whole product principle is near-zero maintenance, so this should
 * read as "worth a second look", not as a weekly chore.
 */
const CAPACITY_STALE_DAYS = 14

/** Stale in both directions — a forgotten green ("I'm free") misleads exactly as much as a forgotten red. */
export function isCapacityStale(updatedAt: Timestamp): boolean {
  return daysSince(updatedAt) >= CAPACITY_STALE_DAYS
}
