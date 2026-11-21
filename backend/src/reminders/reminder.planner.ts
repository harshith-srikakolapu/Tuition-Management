import { ReminderType } from '@prisma/client';
import { addDays } from '../common/dates';

export interface PlanInput {
  today: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD for the current month's charge
  outstanding: number; // total unpaid incl. arrears
  daysBefore: number;
  daysAfter: number;
}

/**
 * Which reminder (if any) is due today. Windows are open-ended ("on or after"),
 * so a missed scheduler run catches up the next day. Duplicates are prevented by
 * the (student, month, type) unique key, not here.
 */
export function planReminder(p: PlanInput): ReminderType | null {
  if (p.outstanding <= 0) return null;
  if (p.today >= addDays(p.dueDate, p.daysAfter) && p.today > p.dueDate) return 'AFTER_DUE';
  if (p.today >= addDays(p.dueDate, -p.daysBefore) && p.today <= p.dueDate) return 'BEFORE_DUE';
  return null;
}
