/**
 * Pure fee/dues computation. No database access — easy to unit test.
 *
 * Model: every month from the student's joining month (until they leave) adds a
 * charge. Payments are separate records, applied oldest-first (FIFO) to the
 * oldest unpaid month. This handles partial payments, advance payments and
 * arrears without ever storing a "paid" flag.
 */
import { addMonths, daysInMonth, diffDays, monthOf, monthRange } from '../common/dates';

export interface FeeInput {
  joinedOn: string; // YYYY-MM-DD
  leftOn?: string | null;
  monthlyFee: number; // before discount
  discount: number; // flat ₹ off per month
  dueDay: number; // 1..31, clamped to month length
  proRateFirstMonth: boolean;
}

export interface PaymentInput {
  amount: number;
  paidOn: string; // YYYY-MM-DD
}

export type MonthStatus = 'PAID' | 'PARTIAL' | 'UNPAID';

export interface MonthLedger {
  month: string;
  charge: number;
  paid: number;
  balance: number;
  dueDate: string;
  status: MonthStatus;
  /** Date of the payment that fully settled this month (null if not settled). */
  paidOffOn: string | null;
  /** Days after due date it was settled (0 if on time / in advance). */
  delayDays: number | null;
}

export interface Ledger {
  months: MonthLedger[];
  totalCharged: number;
  totalPaid: number;
  /** Unpaid amount across all charged months (>= 0). */
  outstanding: number;
  /** Credit left after covering all charged months (>= 0). */
  advance: number;
}

export function dueDateFor(fee: FeeInput, month: string): string {
  const day = Math.min(Math.max(fee.dueDay, 1), daysInMonth(month));
  const due = `${month}-${String(day).padStart(2, '0')}`;
  // A student who joins after the due day owes the first month from their joining date.
  if (month === monthOf(fee.joinedOn) && fee.joinedOn > due) return fee.joinedOn;
  return due;
}

export function monthlyCharge(fee: FeeInput, month: string): number {
  const joinMonth = monthOf(fee.joinedOn);
  if (month < joinMonth) return 0;
  if (fee.leftOn && month > monthOf(fee.leftOn)) return 0;
  const base = Math.max(0, fee.monthlyFee - fee.discount);
  if (fee.proRateFirstMonth && month === joinMonth) {
    const dim = daysInMonth(month);
    const joinDay = Number(fee.joinedOn.slice(8, 10));
    return Math.round((base * (dim - joinDay + 1)) / dim);
  }
  return base;
}

export function chargedMonths(fee: FeeInput, uptoMonth: string): string[] {
  const start = monthOf(fee.joinedOn);
  let end = uptoMonth;
  if (fee.leftOn && monthOf(fee.leftOn) < end) end = monthOf(fee.leftOn);
  return monthRange(start, end);
}

export function computeLedger(fee: FeeInput, payments: PaymentInput[], uptoMonth: string): Ledger {
  const queue = [...payments]
    .filter((p) => p.amount > 0)
    .sort((a, b) => (a.paidOn < b.paidOn ? -1 : a.paidOn > b.paidOn ? 1 : 0))
    .map((p) => ({ ...p, left: p.amount }));
  const totalPaid = queue.reduce((s, p) => s + p.amount, 0);

  let qi = 0;
  const months: MonthLedger[] = chargedMonths(fee, uptoMonth).map((month) => {
    const charge = monthlyCharge(fee, month);
    const dueDate = dueDateFor(fee, month);
    let need = charge;
    let paidOffOn: string | null = charge === 0 ? dueDate : null;
    while (need > 0 && qi < queue.length) {
      const take = Math.min(need, queue[qi].left);
      queue[qi].left -= take;
      need -= take;
      if (need === 0) paidOffOn = queue[qi].paidOn;
      if (queue[qi].left === 0) qi++;
    }
    const paid = charge - need;
    return {
      month,
      charge,
      paid,
      balance: need,
      dueDate,
      status: need === 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID',
      paidOffOn,
      delayDays: paidOffOn ? Math.max(0, diffDays(paidOffOn, dueDate)) : null,
    } satisfies MonthLedger;
  });

  const totalCharged = months.reduce((s, m) => s + m.charge, 0);
  const outstanding = months.reduce((s, m) => s + m.balance, 0);
  const advance = queue.slice(qi).reduce((s, p) => s + p.left, 0);
  return { months, totalCharged, totalPaid, outstanding, advance };
}

/** How many future months an advance credit covers (for display). */
export function monthsCoveredByAdvance(fee: FeeInput, advance: number, fromMonth: string): number {
  let n = 0;
  let left = advance;
  for (let m = addMonths(fromMonth, 1); n < 24; m = addMonths(m, 1)) {
    const c = monthlyCharge(fee, m);
    if (c <= 0 || left < c) break;
    left -= c;
    n++;
  }
  return n;
}
