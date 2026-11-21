import { BadRequestException, Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { Batch, FeeRule, Prisma, Student } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/auth';
import { diffDays, firstDay, isValidMonth, lastDay, monthOf, toDateStr, toDbDate, todayIST } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { renderMessage, waLink } from '../reminders/messages';
import { computeLedger, FeeInput, Ledger, MonthLedger } from './dues.engine';

type StudentWithFee = Student & { batch: Batch; feeRule: FeeRule | null };

export function feeInputOf(s: StudentWithFee): FeeInput {
  return {
    joinedOn: toDateStr(s.joinedOn),
    leftOn: s.leftOn ? toDateStr(s.leftOn) : null,
    monthlyFee: s.feeRule?.monthlyFee ?? s.batch.defaultMonthlyFee,
    discount: s.feeRule?.discount ?? 0,
    dueDay: s.feeRule?.dueDay ?? 5,
    proRateFirstMonth: s.feeRule?.proRateFirstMonth ?? false,
  };
}

export interface StudentLedger {
  student: StudentWithFee;
  fee: FeeInput;
  ledger: Ledger;
  lastPaymentOn: string | null;
}

export interface DueRow {
  studentId: string;
  name: string;
  parentName: string | null;
  parentPhone: string;
  batchId: string;
  batchName: string;
  status: Student['status'];
  month: string;
  monthCharge: number;
  monthPaid: number;
  monthBalance: number;
  monthStatus: MonthLedger['status'] | 'NOT_CHARGED';
  dueDate: string | null;
  arrears: number;
  outstanding: number;
  advance: number;
  overdueDays: number;
  lastPaymentOn: string | null;
}

export function parseMonthParam(month: string | undefined): string {
  if (!month) return monthOf(todayIST());
  if (!isValidMonth(month)) throw new BadRequestException('month must be YYYY-MM');
  return month;
}

@Injectable()
export class DuesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Load students (+fee rules, payments) and compute each ledger up to `uptoMonth`. */
  async ledgers(centerId: string, uptoMonth: string, where: Prisma.StudentWhereInput = {}): Promise<StudentLedger[]> {
    const students = await this.prisma.student.findMany({
      where: { ...where, centerId },
      include: { batch: true, feeRule: true, payments: { select: { amount: true, paidOn: true } } },
      orderBy: { name: 'asc' },
    });
    return students.map(({ payments, ...student }) => {
      const fee = feeInputOf(student);
      const pays = payments.map((p) => ({ amount: p.amount, paidOn: toDateStr(p.paidOn) }));
      const lastPaymentOn = pays.reduce<string | null>((m, p) => (!m || p.paidOn > m ? p.paidOn : m), null);
      return { student, fee, ledger: computeLedger(fee, pays, uptoMonth), lastPaymentOn };
    });
  }

  toDueRow(sl: StudentLedger, month: string, today = todayIST()): DueRow {
    const m = sl.ledger.months.find((x) => x.month === month);
    const monthBalance = m?.balance ?? 0;
    return {
      studentId: sl.student.id,
      name: sl.student.name,
      parentName: sl.student.parentName,
      parentPhone: sl.student.parentPhone,
      batchId: sl.student.batchId,
      batchName: sl.student.batch.name,
      status: sl.student.status,
      month,
      monthCharge: m?.charge ?? 0,
      monthPaid: m?.paid ?? 0,
      monthBalance,
      monthStatus: m?.status ?? 'NOT_CHARGED',
      dueDate: m?.dueDate ?? null,
      arrears: sl.ledger.outstanding - monthBalance,
      outstanding: sl.ledger.outstanding,
      advance: sl.ledger.advance,
      overdueDays: m && monthBalance > 0 && today > m.dueDate ? diffDays(today, m.dueDate) : 0,
      lastPaymentOn: sl.lastPaymentOn,
    };
  }

  /** Students who were charged in `month` or still owe something. */
  async duesForMonth(centerId: string, month: string, opts: { batchId?: string; onlyUnpaid?: boolean } = {}) {
    const today = todayIST();
    const center = await this.prisma.center.findUniqueOrThrow({ where: { id: centerId } });
    const rows = (await this.ledgers(centerId, month, opts.batchId ? { batchId: opts.batchId } : {}))
      .map((sl) => {
        const row = this.toDueRow(sl, month, today);
        const text = renderMessage('GENERIC_DUE', center.language, {
          parentName: row.parentName,
          studentName: row.name,
          centerName: center.name,
          amount: row.outstanding,
          month,
          upiId: center.upiId,
        });
        return { ...row, reminderLink: row.outstanding > 0 ? waLink(row.parentPhone, text) : null };
      })
      .filter((r) => r.monthStatus !== 'NOT_CHARGED' || r.outstanding > 0)
      .filter((r) => !opts.onlyUnpaid || r.outstanding > 0)
      .sort((a, b) => b.overdueDays - a.overdueDays || b.outstanding - a.outstanding || a.name.localeCompare(b.name));
    const totals = rows.reduce(
      (t, r) => ({
        expected: t.expected + r.monthCharge,
        collectedForMonth: t.collectedForMonth + r.monthPaid,
        outstanding: t.outstanding + r.outstanding,
        unpaidStudents: t.unpaidStudents + (r.outstanding > 0 ? 1 : 0),
      }),
      { expected: 0, collectedForMonth: 0, outstanding: 0, unpaidStudents: 0 },
    );
    return { month, today, totals, rows };
  }

  async dashboard(centerId: string) {
    const today = todayIST();
    const month = monthOf(today);
    const [dues, collected, students, batches, pendingReminders, attendanceToday] = await Promise.all([
      this.duesForMonth(centerId, month),
      this.prisma.payment.aggregate({
        where: { centerId, paidOn: { gte: toDbDate(firstDay(month)), lte: toDbDate(lastDay(month)) } },
        _sum: { amount: true },
      }),
      this.prisma.student.count({ where: { centerId, status: 'ACTIVE' } }),
      this.prisma.batch.count({ where: { centerId, active: true } }),
      this.prisma.reminder.count({ where: { centerId, status: { in: ['MANUAL', 'FAILED'] } } }),
      this.prisma.attendance.count({ where: { date: toDbDate(today), student: { centerId } } }),
    ]);
    const { expected, collectedForMonth } = dues.totals;
    return {
      today,
      month,
      ...dues.totals,
      collectedThisMonth: collected._sum.amount ?? 0,
      collectionRate: expected > 0 ? Math.round((collectedForMonth / expected) * 100) : null,
      activeStudents: students,
      activeBatches: batches,
      pendingReminders,
      attendanceMarkedToday: attendanceToday,
      topDues: dues.rows.filter((r) => r.outstanding > 0).slice(0, 50),
    };
  }
}

@Controller()
export class DuesController {
  constructor(private readonly dues: DuesService) {}

  @Get('dashboard') dashboard(@CurrentUser() u: AuthUser) {
    return this.dues.dashboard(u.centerId);
  }

  @Get('dues') list(
    @CurrentUser() u: AuthUser,
    @Query('month') month?: string,
    @Query('batchId') batchId?: string,
    @Query('unpaid') unpaid?: string,
  ) {
    return this.dues.duesForMonth(u.centerId, parseMonthParam(month), { batchId, onlyUnpaid: unpaid === 'true' });
  }
}

@Module({ controllers: [DuesController], providers: [DuesService], exports: [DuesService] })
export class DuesModule {}
