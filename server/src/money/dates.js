/** Small helpers for the `YYYY-MM-DD` day strings used everywhere in Money. */

const DAY = 86400000;

/** Day string → UTC midnight milliseconds. */
export const dayMs = (day) => Date.parse(`${day}T00:00:00Z`);

/** UTC Date (or ms) → day string. */
export const toDay = (value) => new Date(value).toISOString().slice(0, 10);

export const today = (now = new Date()) => toDay(now);

export const addDays = (day, days) => toDay(dayMs(day) + days * DAY);

/** Whole days from `a` to `b` (positive when b is later). */
export const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / DAY);

/** Day `day` of a month (month may overflow, like Dart's DateTime), clamped to the month length. */
export function dayInMonth(year, month, day) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return toDay(Date.UTC(year, month - 1, Math.min(Math.max(day, 1), last)));
}

export const parts = (day) => {
  const [year, month, date] = day.split('-').map(Number);
  return { year, month, date };
};

export const monthOf = (day) => day.slice(0, 7);

/** 'YYYY-MM' plus `delta` months. */
export function addMonths(month, delta) {
  const [year, value] = month.split('-').map(Number);
  return new Date(Date.UTC(year, value - 1 + delta, 1))
    .toISOString()
    .slice(0, 7);
}

/** Days of a 'YYYY-MM' month as day strings. */
export function daysOfMonth(month) {
  const [year, value] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, value, 0)).getUTCDate();
  return Array.from({ length: last }, (_, index) =>
    toDay(Date.UTC(year, value - 1, index + 1)),
  );
}

/** Day + optional `HH:mm` → ms. Without a time the moment is noon of that day. */
export function stamp(day, time) {
  const [hours, minutes] = (time ?? '12:00').split(':').map(Number);
  return dayMs(day) + (hours * 60 + minutes) * 60000;
}
