import {
  BadRequestException,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Center, Prisma, Reminder, ReminderStatus } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/auth';
import { dateLabel, monthOf, toDateStr, toDbDate, todayIST, TZ } from '../common/dates';
import { DuesModule, DuesService } from '../dues/dues.module';
import { PrismaService } from '../prisma/prisma.service';
import { renderMessage, waLink } from './messages';
import { planReminder } from './reminder.planner';
import { WhatsAppProvider } from './whatsapp.provider';

export interface RunSummary {
  centerId: string;
  created: number;
  alreadySent: number;
  sentViaApi: number;
  queuedManual: number;
  failed: number;
  retried: number;
}

@Injectable()
export class RemindersService {
  private readonly log = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dues: DuesService,
    private readonly wa: WhatsAppProvider,
  ) {}

  /** Daily job: 9:00 AM India time. */
  @Cron('0 9 * * *', { name: 'fee-reminders', timeZone: TZ })
  async scheduled() {
    if (process.env.ENABLE_SCHEDULER === 'false') return;
    await this.runAll();
  }

  async runAll(today = todayIST()) {
    const centers = await this.prisma.center.findMany({ where: { remindersEnabled: true } });
    const results: RunSummary[] = [];
    for (const c of centers) {
      try {
        results.push(await this.runForCenter(c, today));
      } catch (e) {
        this.log.error(`Reminder run failed for center ${c.id}`, e as Error);
      }
    }
    this.log.log(`Reminder run ${today}: ${JSON.stringify(results)}`);
    return results;
  }

  /**
   * Idempotent: the (student, month, type) unique key means re-running on the same
   * day — or after a crash/retry — never creates or sends a second copy.
   */
  async runForCenter(center: Center, today = todayIST()): Promise<RunSummary> {
    const month = monthOf(today);
    const summary: RunSummary = { centerId: center.id, created: 0, alreadySent: 0, sentViaApi: 0, queuedManual: 0, failed: 0, retried: 0 };
    const ledgers = await this.dues.ledgers(center.id, month, { status: 'ACTIVE', allowReminders: true });
    const useApi = this.wa.enabled;

    for (const { student, ledger } of ledgers) {
      const current = ledger.months.find((m) => m.month === month);
      if (!current) continue;
      const type = planReminder({
        today,
        dueDate: current.dueDate,
        outstanding: ledger.outstanding,
        daysBefore: center.remindDaysBefore,
        daysAfter: center.remindDaysAfter,
      });
      if (!type) continue;

      const message = renderMessage(type, center.language, {
        parentName: student.parentName,
        studentName: student.name,
        centerName: center.name,
        amount: ledger.outstanding,
        month,
        dueDate: current.dueDate,
        upiId: center.upiId,
      });

      let reminder: Reminder;
      try {
        reminder = await this.prisma.reminder.create({
          data: {
            centerId: center.id,
            studentId: student.id,
            month,
            type,
            channel: useApi ? 'WHATSAPP_API' : 'WA_LINK',
            status: useApi ? 'PENDING' : 'MANUAL',
            amountDue: ledger.outstanding,
            dueDate: toDbDate(current.dueDate),
            message,
          },
        });
        summary.created++;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          summary.alreadySent++;
          continue;
        }
        throw e;
      }

      if (!useApi) {
        summary.queuedManual++;
        continue;
      }
      (await this.dispatch(reminder, center, student)) ? summary.sentViaApi++ : summary.failed++;
    }

    // Retry API failures from this month (each row is still sent at most once successfully).
    if (useApi) {
      const failed = await this.prisma.reminder.findMany({
        where: { centerId: center.id, month, status: 'FAILED', channel: 'WHATSAPP_API' },
        include: { student: true },
      });
      for (const r of failed) {
        summary.retried++;
        await this.dispatch(r, center, r.student);
      }
    }
    return summary;
  }

  private async dispatch(
    r: Reminder,
    center: Center,
    student: { parentName: string | null; parentPhone: string; name: string },
  ): Promise<boolean> {
    try {
      await this.wa.send({
        phone: student.parentPhone,
        type: r.type,
        language: center.language,
        params: [
          student.parentName || 'Parent',
          student.name,
          `₹${r.amountDue.toLocaleString('en-IN')}`,
          dateLabel(toDateStr(r.dueDate)),
          center.name,
        ],
      });
      await this.prisma.reminder.update({ where: { id: r.id }, data: { status: 'SENT', sentAt: new Date(), error: null } });
      return true;
    } catch (e) {
      await this.prisma.reminder.update({
        where: { id: r.id },
        data: { status: 'FAILED', error: String((e as Error).message ?? e).slice(0, 500) },
      });
      return false;
    }
  }

  async list(centerId: string, status?: string) {
    const statuses = status ? status.split(',') : undefined;
    if (statuses?.some((s) => !(s in ReminderStatus))) throw new BadRequestException('Unknown status');
    const rows = await this.prisma.reminder.findMany({
      where: { centerId, ...(statuses ? { status: { in: statuses as ReminderStatus[] } } : {}) },
      include: { student: { select: { name: true, parentName: true, parentPhone: true, batch: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return rows.map(({ student, ...r }) => ({
      ...r,
      dueDate: toDateStr(r.dueDate),
      studentName: student.name,
      parentName: student.parentName,
      parentPhone: student.parentPhone,
      batchName: student.batch.name,
      waLink: waLink(student.parentPhone, r.message),
    }));
  }

  async setStatus(centerId: string, id: string, status: 'SENT' | 'SKIPPED') {
    const r = await this.prisma.reminder.findFirst({ where: { id, centerId } });
    if (!r) throw new NotFoundException('Reminder not found');
    return this.prisma.reminder.update({
      where: { id },
      data: { status, sentAt: status === 'SENT' ? new Date() : r.sentAt },
    });
  }
}

@Controller('reminders')
export class RemindersController {
  constructor(
    private readonly svc: RemindersService,
    private readonly prisma: PrismaService,
    private readonly wa: WhatsAppProvider,
  ) {}

  @Get() list(@CurrentUser() u: AuthUser, @Query('status') status?: string) {
    return this.svc.list(u.centerId, status);
  }

  @Get('config') config() {
    return { whatsappApiEnabled: this.wa.enabled };
  }

  /** "Run now" button — same idempotent logic as the daily job. */
  @Post('run') async run(@CurrentUser() u: AuthUser) {
    const center = await this.prisma.center.findUniqueOrThrow({ where: { id: u.centerId } });
    return this.svc.runForCenter(center);
  }

  @Post(':id/sent') sent(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.setStatus(u.centerId, id, 'SENT');
  }

  @Post(':id/skip') skip(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.setStatus(u.centerId, id, 'SKIPPED');
  }
}

@Module({
  imports: [DuesModule],
  controllers: [RemindersController],
  providers: [RemindersService, WhatsAppProvider],
  exports: [RemindersService],
})
export class RemindersModule {}
