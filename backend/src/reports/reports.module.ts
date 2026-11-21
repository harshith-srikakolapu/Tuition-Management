import { Controller, Get, Injectable, Module, Query, StreamableFile } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { AuthUser, CurrentUser } from '../common/auth';
import { addDays, firstDay, lastDay, monthLabel, toDateStr, toDbDate } from '../common/dates';
import { DueRow, DuesModule, DuesService, parseMonthParam } from '../dues/dues.module';
import { PrismaService } from '../prisma/prisma.service';

export interface MonthlyReport {
  center: { name: string; address: string | null; phone: string | null };
  month: string;
  monthLabel: string;
  generatedAt: string;
  summary: {
    expected: number;
    collectedForMonth: number;
    collectionRate: number | null;
    collectedInMonth: number;
    byMode: Record<string, number>;
    outstanding: number;
    unpaidStudents: number;
    studentsCharged: number;
    avgDelayDays: number | null;
    onTimePercent: number | null;
    remindersSent: number;
    remindersPaidWithin3Days: number;
    reminderConversion: number | null;
  };
  payments: { paidOn: string; studentName: string; batchName: string; amount: number; mode: string; reference: string | null }[];
  dues: DueRow[];
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dues: DuesService,
  ) {}

  async monthly(centerId: string, month: string): Promise<MonthlyReport> {
    const from = toDbDate(firstDay(month));
    const to = toDbDate(lastDay(month));
    const [center, ledgers, payments, reminders] = await Promise.all([
      this.prisma.center.findUniqueOrThrow({ where: { id: centerId } }),
      this.dues.ledgers(centerId, month),
      this.prisma.payment.findMany({
        where: { centerId, paidOn: { gte: from, lte: to } },
        include: { student: { select: { name: true, batch: { select: { name: true } } } } },
        orderBy: { paidOn: 'asc' },
      }),
      this.prisma.reminder.findMany({
        where: { centerId, month, status: 'SENT', sentAt: { not: null } },
        select: { studentId: true, sentAt: true },
      }),
    ]);

    const dues = ledgers
      .map((sl) => this.dues.toDueRow(sl, month))
      .filter((r) => r.monthStatus !== 'NOT_CHARGED' || r.outstanding > 0);
    const monthEntries = ledgers.map((l) => l.ledger.months.find((m) => m.month === month)).filter((m) => m && m.charge > 0);
    const settled = monthEntries.filter((m) => m!.delayDays !== null);
    const expected = dues.reduce((s, r) => s + r.monthCharge, 0);
    const collectedForMonth = dues.reduce((s, r) => s + r.monthPaid, 0);

    const byMode: Record<string, number> = { CASH: 0, UPI: 0, OTHER: 0 };
    for (const p of payments) byMode[p.mode] += p.amount;

    // Reminder effectiveness: a payment by that student within 3 days of the reminder.
    const payDatesByStudent = new Map<string, string[]>();
    const allPays = await this.prisma.payment.findMany({
      where: { centerId, studentId: { in: reminders.map((r) => r.studentId) } },
      select: { studentId: true, paidOn: true },
    });
    for (const p of allPays) {
      const list = payDatesByStudent.get(p.studentId) ?? [];
      list.push(toDateStr(p.paidOn));
      payDatesByStudent.set(p.studentId, list);
    }
    const converted = reminders.filter((r) => {
      const sent = r.sentAt!.toISOString().slice(0, 10);
      const until = addDays(sent, 3);
      return (payDatesByStudent.get(r.studentId) ?? []).some((d) => d >= sent && d <= until);
    }).length;

    return {
      center: { name: center.name, address: center.address, phone: center.phone },
      month,
      monthLabel: monthLabel(month),
      generatedAt: new Date().toISOString(),
      summary: {
        expected,
        collectedForMonth,
        collectionRate: expected > 0 ? Math.round((collectedForMonth / expected) * 100) : null,
        collectedInMonth: payments.reduce((s, p) => s + p.amount, 0),
        byMode,
        outstanding: dues.reduce((s, r) => s + r.outstanding, 0),
        unpaidStudents: dues.filter((r) => r.outstanding > 0).length,
        studentsCharged: monthEntries.length,
        avgDelayDays: settled.length
          ? Math.round((settled.reduce((s, m) => s + m!.delayDays!, 0) / settled.length) * 10) / 10
          : null,
        onTimePercent: settled.length ? Math.round((settled.filter((m) => m!.delayDays === 0).length / settled.length) * 100) : null,
        remindersSent: reminders.length,
        remindersPaidWithin3Days: converted,
        reminderConversion: reminders.length ? Math.round((converted / reminders.length) * 100) : null,
      },
      payments: payments.map((p) => ({
        paidOn: toDateStr(p.paidOn),
        studentName: p.student.name,
        batchName: p.student.batch.name,
        amount: p.amount,
        mode: p.mode,
        reference: p.reference,
      })),
      dues: dues.sort((a, b) => a.batchName.localeCompare(b.batchName) || a.name.localeCompare(b.name)),
    };
  }

  async excel(r: MonthlyReport): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Tuition Center Manager';
    const bold = { font: { bold: true } };

    const s = wb.addWorksheet('Summary');
    s.columns = [{ width: 34 }, { width: 18 }];
    s.addRow([`${r.center.name} — Collection report`]).font = { bold: true, size: 14 };
    s.addRow([r.monthLabel]);
    s.addRow([]);
    const rows: [string, number | string | null][] = [
      ['Expected fees (this month)', r.summary.expected],
      ['Collected against this month', r.summary.collectedForMonth],
      ['Collection rate (%)', r.summary.collectionRate],
      ['Total received in month', r.summary.collectedInMonth],
      ['  Cash', r.summary.byMode.CASH],
      ['  UPI', r.summary.byMode.UPI],
      ['  Other', r.summary.byMode.OTHER],
      ['Total outstanding (incl. arrears)', r.summary.outstanding],
      ['Students with dues', r.summary.unpaidStudents],
      ['Average payment delay (days)', r.summary.avgDelayDays],
      ['Paid on time (%)', r.summary.onTimePercent],
      ['Reminders sent', r.summary.remindersSent],
      ['Paid within 3 days of reminder', r.summary.remindersPaidWithin3Days],
    ];
    rows.forEach(([k, v]) => s.addRow([k, v ?? '–']));

    const p = wb.addWorksheet('Payments');
    p.columns = [
      { header: 'Date', key: 'paidOn', width: 12 },
      { header: 'Student', key: 'studentName', width: 26 },
      { header: 'Batch', key: 'batchName', width: 18 },
      { header: 'Amount (₹)', key: 'amount', width: 12 },
      { header: 'Mode', key: 'mode', width: 8 },
      { header: 'Reference', key: 'reference', width: 20 },
    ];
    p.getRow(1).font = bold.font;
    r.payments.forEach((x) => p.addRow(x));
    p.addRow({ studentName: 'Total', amount: r.summary.collectedInMonth }).font = bold.font;

    const d = wb.addWorksheet('Dues');
    d.columns = [
      { header: 'Student', key: 'name', width: 26 },
      { header: 'Batch', key: 'batchName', width: 18 },
      { header: 'Parent phone', key: 'parentPhone', width: 16 },
      { header: 'Fee (₹)', key: 'monthCharge', width: 10 },
      { header: 'Paid (₹)', key: 'monthPaid', width: 10 },
      { header: 'Status', key: 'monthStatus', width: 10 },
      { header: 'Arrears (₹)', key: 'arrears', width: 12 },
      { header: 'Outstanding (₹)', key: 'outstanding', width: 15 },
      { header: 'Due date', key: 'dueDate', width: 12 },
    ];
    d.getRow(1).font = bold.font;
    r.dues.forEach((x) => d.addRow(x));

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  pdf(r: MonthlyReport): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Standard PDF fonts have no ₹ glyph, so amounts use "Rs."
      const rs = (n: number) => `Rs. ${n.toLocaleString('en-IN')}`;
      const pct = (n: number | null) => (n === null ? '–' : `${n}%`);

      doc.fontSize(18).font('Helvetica-Bold').text(r.center.name);
      doc.fontSize(11).font('Helvetica').fillColor('#555').text(`Monthly collection report — ${r.monthLabel}`);
      if (r.center.address) doc.text(r.center.address);
      doc.moveDown().fillColor('#000');

      const kv: [string, string][] = [
        ['Expected fees', rs(r.summary.expected)],
        ['Collected against month', `${rs(r.summary.collectedForMonth)} (${pct(r.summary.collectionRate)})`],
        ['Received in month', `${rs(r.summary.collectedInMonth)}  (Cash ${rs(r.summary.byMode.CASH)}, UPI ${rs(r.summary.byMode.UPI)}, Other ${rs(r.summary.byMode.OTHER)})`],
        ['Outstanding (incl. arrears)', `${rs(r.summary.outstanding)} from ${r.summary.unpaidStudents} students`],
        ['Avg. payment delay', r.summary.avgDelayDays === null ? '–' : `${r.summary.avgDelayDays} days (on time: ${pct(r.summary.onTimePercent)})`],
        ['Reminders → paid in 3 days', `${r.summary.remindersPaidWithin3Days} of ${r.summary.remindersSent} (${pct(r.summary.reminderConversion)})`],
      ];
      doc.fontSize(10);
      for (const [k, v] of kv) {
        const y = doc.y;
        doc.font('Helvetica-Bold').text(k, 40, y, { width: 170 });
        doc.font('Helvetica').text(v, 215, y, { width: 340 });
        doc.moveDown(0.3);
      }

      const table = (title: string, cols: { h: string; w: number; align?: 'left' | 'right' }[], data: string[][]) => {
        doc.moveDown().font('Helvetica-Bold').fontSize(12).text(title, 40);
        doc.moveDown(0.3).fontSize(9);
        const drawRow = (cells: string[], header = false) => {
          if (doc.y > 780) doc.addPage();
          const y = doc.y;
          let x = 40;
          doc.font(header ? 'Helvetica-Bold' : 'Helvetica');
          cells.forEach((c, i) => {
            doc.text(c, x, y, { width: cols[i].w - 6, align: cols[i].align ?? 'left', lineBreak: false, ellipsis: true });
            x += cols[i].w;
          });
          doc.y = y + 14;
          if (header) doc.moveTo(40, doc.y - 3).lineTo(555, doc.y - 3).strokeColor('#999').stroke();
        };
        drawRow(cols.map((c) => c.h), true);
        if (data.length === 0) drawRow(['None']);
        data.forEach((row) => drawRow(row));
      };

      table(
        'Students with dues',
        [
          { h: 'Student', w: 140 },
          { h: 'Batch', w: 100 },
          { h: 'Phone', w: 90 },
          { h: 'This month', w: 70, align: 'right' },
          { h: 'Arrears', w: 55, align: 'right' },
          { h: 'Total due', w: 60, align: 'right' },
        ],
        r.dues
          .filter((x) => x.outstanding > 0)
          .map((x) => [x.name, x.batchName, x.parentPhone, rs(x.monthBalance), rs(x.arrears), rs(x.outstanding)]),
      );

      table(
        'Payments received',
        [
          { h: 'Date', w: 70 },
          { h: 'Student', w: 150 },
          { h: 'Batch', w: 110 },
          { h: 'Mode', w: 50 },
          { h: 'Amount', w: 80, align: 'right' },
        ],
        r.payments.map((x) => [x.paidOn, x.studentName, x.batchName, x.mode, rs(x.amount)]),
      );

      doc.moveDown().fontSize(8).fillColor('#888').text(`Generated ${new Date(r.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 40);
      doc.end();
    });
  }
}

@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('monthly') monthly(@CurrentUser() u: AuthUser, @Query('month') month?: string) {
    return this.svc.monthly(u.centerId, parseMonthParam(month));
  }

  @Get('monthly.xlsx') async xlsx(@CurrentUser() u: AuthUser, @Query('month') month?: string) {
    const r = await this.svc.monthly(u.centerId, parseMonthParam(month));
    return new StreamableFile(await this.svc.excel(r), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="collection-${r.month}.xlsx"`,
    });
  }

  @Get('monthly.pdf') async pdf(@CurrentUser() u: AuthUser, @Query('month') month?: string) {
    const r = await this.svc.monthly(u.centerId, parseMonthParam(month));
    return new StreamableFile(await this.svc.pdf(r), {
      type: 'application/pdf',
      disposition: `attachment; filename="collection-${r.month}.pdf"`,
    });
  }
}

@Module({ imports: [DuesModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
