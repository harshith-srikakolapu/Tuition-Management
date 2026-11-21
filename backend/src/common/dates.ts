/**
 * Date helpers. All calendar logic works on plain strings ("YYYY-MM-DD" dates,
 * "YYYY-MM" months) using UTC arithmetic, so server timezone never leaks in.
 * "Today" is always evaluated in the center's timezone (India).
 */
export const TZ = 'Asia/Kolkata';

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isValidDate = (s: string) => DATE_RE.test(s);
export const isValidMonth = (s: string) => MONTH_RE.test(s);

export function todayIST(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export const monthOf = (date: string) => date.slice(0, 7);

function parseMonth(month: string): [number, number] {
  const [y, m] = month.split('-').map(Number);
  return [y, m];
}

export function daysInMonth(month: string): number {
  const [y, m] = parseMonth(month);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(month: string, n: number): string {
  const [y, m] = parseMonth(month);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Inclusive list of months from `from` to `to`. Empty if from > to. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export const firstDay = (month: string) => `${month}-01`;
export const lastDay = (month: string) => `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** a - b in whole days */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/** Prisma returns @db.Date columns as UTC-midnight Date objects. */
export const toDateStr = (d: Date) => d.toISOString().slice(0, 10);
export const toDbDate = (s: string) => new Date(`${s}T00:00:00Z`);

export function monthLabel(month: string, locale = 'en-IN'): string {
  const [y, m] = parseMonth(month);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function dateLabel(date: string, locale = 'en-IN'): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
