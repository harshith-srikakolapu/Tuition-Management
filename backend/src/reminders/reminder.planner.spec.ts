import { planReminder } from './reminder.planner';
import { renderMessage, waLink } from './messages';
import { normalizePhone } from '../common/validators';

const base = { dueDate: '2026-03-10', outstanding: 1000, daysBefore: 3, daysAfter: 3 };

describe('planReminder', () => {
  it('sends nothing when nothing is owed', () => {
    expect(planReminder({ ...base, today: '2026-03-08', outstanding: 0 })).toBeNull();
  });
  it('sends nothing too early', () => {
    expect(planReminder({ ...base, today: '2026-03-06' })).toBeNull();
  });
  it('sends BEFORE_DUE from N days before up to the due date', () => {
    expect(planReminder({ ...base, today: '2026-03-07' })).toBe('BEFORE_DUE');
    expect(planReminder({ ...base, today: '2026-03-10' })).toBe('BEFORE_DUE');
  });
  it('waits during the grace period after the due date', () => {
    expect(planReminder({ ...base, today: '2026-03-12' })).toBeNull();
  });
  it('sends AFTER_DUE once the grace period has passed (and catches up later)', () => {
    expect(planReminder({ ...base, today: '2026-03-13' })).toBe('AFTER_DUE');
    expect(planReminder({ ...base, today: '2026-03-25' })).toBe('AFTER_DUE');
  });
  it('handles daysAfter = 0 (day after due date)', () => {
    expect(planReminder({ ...base, daysAfter: 0, today: '2026-03-10' })).toBe('BEFORE_DUE');
    expect(planReminder({ ...base, daysAfter: 0, today: '2026-03-11' })).toBe('AFTER_DUE');
  });
});

describe('messages', () => {
  it('renders English reminder with UPI', () => {
    const m = renderMessage('BEFORE_DUE', 'en', {
      parentName: 'Mrs. Rao',
      studentName: 'Anu',
      centerName: 'Bright Minds',
      amount: 1500,
      month: '2026-03',
      dueDate: '2026-03-10',
      upiId: 'bright@upi',
    });
    expect(m).toContain('Dear Mrs. Rao');
    expect(m).toContain('₹1,500');
    expect(m).toContain('bright@upi');
  });
  it('falls back to English for unknown languages', () => {
    const m = renderMessage('GENERIC_DUE', 'xx', { studentName: 'A', centerName: 'C', amount: 1, month: '2026-01' });
    expect(m).toContain('Dear Parent');
  });
  it('normalises Indian phone numbers for wa.me', () => {
    expect(normalizePhone('98765 43210')).toBe('919876543210');
    expect(normalizePhone('+91-98765-43210')).toBe('919876543210');
    expect(normalizePhone('09876543210')).toBe('919876543210');
    expect(waLink('9876543210', 'hi there')).toBe('https://wa.me/919876543210?text=hi%20there');
  });
});
