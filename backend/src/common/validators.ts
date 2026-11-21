import { Matches } from 'class-validator';

export const IsDateString = () => Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { message: 'must be YYYY-MM-DD' });
export const IsMonthString = () => Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'must be YYYY-MM' });
export const IsPhone = () =>
  Matches(/^\+?[\d\s-]{10,16}$/, { message: 'must be a valid phone number (10 digits, optional +91)' });

/** Normalise an Indian phone number to E.164 digits without '+', e.g. 919876543210. */
export function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d;
}
