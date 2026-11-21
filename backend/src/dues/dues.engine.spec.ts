import { computeLedger, dueDateFor, FeeInput, monthlyCharge, monthsCoveredByAdvance } from './dues.engine';

const fee = (over: Partial<FeeInput> = {}): FeeInput => ({
  joinedOn: '2026-01-10',
  monthlyFee: 1000,
  discount: 0,
  dueDay: 5,
  proRateFirstMonth: false,
  ...over,
});

describe('monthlyCharge', () => {
  it('applies flat discount', () => {
    expect(monthlyCharge(fee({ discount: 200 }), '2026-02')).toBe(800);
  });
  it('never goes negative', () => {
    expect(monthlyCharge(fee({ discount: 5000 }), '2026-02')).toBe(0);
  });
  it('pro-rates the joining month when enabled', () => {
    // Jan has 31 days, joined on 10th => 22 days => 1000*22/31 = 709.67
    expect(monthlyCharge(fee({ proRateFirstMonth: true }), '2026-01')).toBe(710);
    expect(monthlyCharge(fee({ proRateFirstMonth: true }), '2026-02')).toBe(1000);
  });
  it('charges nothing before joining or after leaving', () => {
    expect(monthlyCharge(fee(), '2025-12')).toBe(0);
    expect(monthlyCharge(fee({ leftOn: '2026-03-15' }), '2026-03')).toBe(1000);
    expect(monthlyCharge(fee({ leftOn: '2026-03-15' }), '2026-04')).toBe(0);
  });
});

describe('dueDateFor', () => {
  it('clamps due day to month length', () => {
    expect(dueDateFor(fee({ dueDay: 31 }), '2026-02')).toBe('2026-02-28');
  });
  it('uses joining date when joining after the due day', () => {
    expect(dueDateFor(fee(), '2026-01')).toBe('2026-01-10');
    expect(dueDateFor(fee(), '2026-02')).toBe('2026-02-05');
  });
});

describe('computeLedger', () => {
  it('marks everything unpaid with no payments', () => {
    const l = computeLedger(fee(), [], '2026-03');
    expect(l.months.map((m) => m.status)).toEqual(['UNPAID', 'UNPAID', 'UNPAID']);
    expect(l.outstanding).toBe(3000);
    expect(l.advance).toBe(0);
  });

  it('handles partial payments FIFO', () => {
    const l = computeLedger(
      fee(),
      [
        { amount: 600, paidOn: '2026-01-12' },
        { amount: 600, paidOn: '2026-02-03' },
      ],
      '2026-02',
    );
    expect(l.months[0]).toMatchObject({ status: 'PAID', paid: 1000, paidOffOn: '2026-02-03', delayDays: 24 });
    expect(l.months[1]).toMatchObject({ status: 'PARTIAL', paid: 200, balance: 800 });
    expect(l.outstanding).toBe(800);
  });

  it('carries advance payments forward', () => {
    const l = computeLedger(fee(), [{ amount: 3500, paidOn: '2026-01-10' }], '2026-02');
    expect(l.outstanding).toBe(0);
    expect(l.advance).toBe(1500);
    expect(l.months.every((m) => m.delayDays === 0)).toBe(true);
    // next month will be settled by the advance, paid off on the original date
    const later = computeLedger(fee(), [{ amount: 3500, paidOn: '2026-01-10' }], '2026-04');
    expect(later.months[2]).toMatchObject({ status: 'PAID', paidOffOn: '2026-01-10', delayDays: 0 });
    expect(later.months[3]).toMatchObject({ status: 'PARTIAL', balance: 500 });
  });

  it('orders payments by date regardless of input order', () => {
    const l = computeLedger(
      fee(),
      [
        { amount: 1000, paidOn: '2026-02-20' },
        { amount: 1000, paidOn: '2026-01-11' },
      ],
      '2026-02',
    );
    expect(l.months[0].paidOffOn).toBe('2026-01-11');
    expect(l.months[1].paidOffOn).toBe('2026-02-20');
    expect(l.months[1].delayDays).toBe(15);
  });

  it('returns an empty ledger for students joining after the period', () => {
    const l = computeLedger(fee({ joinedOn: '2026-05-01' }), [], '2026-03');
    expect(l.months).toHaveLength(0);
    expect(l.outstanding).toBe(0);
  });

  it('stops charging after the student leaves', () => {
    const l = computeLedger(fee({ leftOn: '2026-02-10' }), [], '2026-06');
    expect(l.months).toHaveLength(2);
    expect(l.outstanding).toBe(2000);
  });
});

describe('monthsCoveredByAdvance', () => {
  it('counts whole future months', () => {
    expect(monthsCoveredByAdvance(fee(), 2500, '2026-02')).toBe(2);
  });
});
