export type PaymentMode = 'CASH' | 'UPI' | 'OTHER';
export type StudentStatus = 'ACTIVE' | 'INACTIVE';
export type MonthStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'NOT_CHARGED';

export interface Center {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  upiId: string | null;
  language: string;
  remindersEnabled: boolean;
  remindDaysBefore: number;
  remindDaysAfter: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  center: Center;
}

export interface Batch {
  id: string;
  name: string;
  schedule: string | null;
  defaultMonthlyFee: number;
  active: boolean;
  activeStudents: number;
}

export interface DueRow {
  studentId: string;
  name: string;
  parentName: string | null;
  parentPhone: string;
  batchId: string;
  batchName: string;
  month: string;
  monthCharge: number;
  monthPaid: number;
  monthBalance: number;
  monthStatus: MonthStatus;
  dueDate: string | null;
  arrears: number;
  outstanding: number;
  advance: number;
  overdueDays: number;
  lastPaymentOn: string | null;
  reminderLink?: string | null;
}

export interface Dashboard {
  today: string;
  month: string;
  expected: number;
  collectedForMonth: number;
  outstanding: number;
  unpaidStudents: number;
  collectedThisMonth: number;
  collectionRate: number | null;
  activeStudents: number;
  activeBatches: number;
  pendingReminders: number;
  attendanceMarkedToday: number;
  topDues: DueRow[];
}

export interface StudentListItem {
  id: string;
  name: string;
  parentName: string | null;
  parentPhone: string;
  status: StudentStatus;
  batchId: string;
  batchName: string;
  joinedOn: string;
  monthlyFee: number;
  outstanding: number;
  advance: number;
}

export interface MonthLedger {
  month: string;
  charge: number;
  paid: number;
  balance: number;
  dueDate: string;
  status: 'PAID' | 'PARTIAL' | 'UNPAID';
  paidOffOn: string | null;
  delayDays: number | null;
}

export interface Payment {
  id: string;
  studentId: string;
  amount: number;
  mode: PaymentMode;
  paidOn: string;
  forMonth: string | null;
  reference: string | null;
  note: string | null;
  studentName?: string;
  batchName?: string;
}

export interface Reminder {
  id: string;
  studentId: string;
  month: string;
  type: 'BEFORE_DUE' | 'AFTER_DUE';
  channel: 'WHATSAPP_API' | 'WA_LINK';
  status: 'PENDING' | 'SENT' | 'FAILED' | 'MANUAL' | 'SKIPPED';
  amountDue: number;
  dueDate: string;
  message: string;
  error: string | null;
  sentAt: string | null;
  createdAt: string;
  studentName?: string;
  parentName?: string | null;
  parentPhone?: string;
  batchName?: string;
  waLink?: string;
}

export interface StudentDetail {
  id: string;
  name: string;
  parentName: string | null;
  parentPhone: string;
  status: StudentStatus;
  batchId: string;
  batch: { id: string; name: string; defaultMonthlyFee: number };
  joinedOn: string;
  leftOn: string | null;
  notes: string | null;
  allowReminders: boolean;
  feeRule: {
    monthlyFee: number | null;
    discount: number;
    discountReason: string | null;
    dueDay: number;
    proRateFirstMonth: boolean;
    effectiveMonthlyFee: number;
  };
  ledger: {
    months: MonthLedger[];
    totalCharged: number;
    totalPaid: number;
    outstanding: number;
    advance: number;
    advanceMonths: number;
  };
  payments: Payment[];
  attendance: { month: string; present: number; total: number; days: { date: string; present: boolean }[] };
  reminders: Reminder[];
  reminderLink: string | null;
}

export interface CreatePaymentResponse {
  payment: Payment;
  outstanding: number;
  advance: number;
  receiptText: string;
  receiptLink: string;
}

export interface AttendanceSheet {
  date: string;
  batchId: string;
  students: { id: string; name: string; present: boolean | null }[];
}

export interface AttendanceSummaryRow {
  studentId: string;
  name: string;
  batchName: string;
  present: number;
  total: number;
  percent: number;
  absentDates: string[];
}

export interface MonthlyReport {
  center: { name: string; address: string | null; phone: string | null };
  month: string;
  monthLabel: string;
  summary: {
    expected: number;
    collectedForMonth: number;
    collectionRate: number | null;
    collectedInMonth: number;
    byMode: Record<PaymentMode, number>;
    outstanding: number;
    unpaidStudents: number;
    studentsCharged: number;
    avgDelayDays: number | null;
    onTimePercent: number | null;
    remindersSent: number;
    remindersPaidWithin3Days: number;
    reminderConversion: number | null;
  };
  payments: { paidOn: string; studentName: string; batchName: string; amount: number; mode: PaymentMode; reference: string | null }[];
  dues: DueRow[];
}
