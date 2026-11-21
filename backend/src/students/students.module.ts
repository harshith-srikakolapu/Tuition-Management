import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { Prisma, StudentStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/auth';
import { firstDay, lastDay, monthOf, toDateStr, toDbDate, todayIST } from '../common/dates';
import { IsDateString, IsPhone } from '../common/validators';
import { monthsCoveredByAdvance } from '../dues/dues.engine';
import { DuesModule, DuesService } from '../dues/dues.module';
import { PrismaService } from '../prisma/prisma.service';
import { renderMessage, waLink } from '../reminders/messages';

export class CreateStudentDto {
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsOptional() @IsString() @MaxLength(100) parentName?: string;
  @IsPhone() parentPhone!: string;
  @IsString() batchId!: string;
  @IsDateString() joinedOn!: string;
  @IsOptional() @IsEnum(StudentStatus) status?: StudentStatus;
  @IsOptional() @IsDateString() leftOn?: string | null;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsOptional() @IsBoolean() allowReminders?: boolean;
  // Fee rule
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) monthlyFee?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) discount?: number;
  @IsOptional() @IsString() @MaxLength(100) discountReason?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(31) dueDay?: number;
  @IsOptional() @IsBoolean() proRateFirstMonth?: boolean;
}
export class UpdateStudentDto extends PartialType(CreateStudentDto) {}

const FEE_KEYS = ['monthlyFee', 'discount', 'discountReason', 'dueDay', 'proRateFirstMonth'] as const;

function split(dto: UpdateStudentDto) {
  const fee: Prisma.FeeRuleUncheckedUpdateInput = {};
  const student: Prisma.StudentUncheckedUpdateInput = {};
  for (const [k, v] of Object.entries(dto)) {
    if (v === undefined) continue;
    if ((FEE_KEYS as readonly string[]).includes(k)) (fee as Record<string, unknown>)[k] = v;
    else if (k === 'joinedOn' || k === 'leftOn') (student as Record<string, unknown>)[k] = v ? toDbDate(v as string) : null;
    else (student as Record<string, unknown>)[k] = v;
  }
  return { fee, student };
}

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dues: DuesService,
  ) {}

  private async assertBatch(centerId: string, batchId: string) {
    const b = await this.prisma.batch.findFirst({ where: { id: batchId, centerId } });
    if (!b) throw new BadRequestException('Batch not found');
  }

  async assertStudent(centerId: string, id: string) {
    const s = await this.prisma.student.findFirst({ where: { id, centerId } });
    if (!s) throw new NotFoundException('Student not found');
    return s;
  }

  async list(centerId: string, q: { batchId?: string; status?: string; search?: string }) {
    const month = monthOf(todayIST());
    const where: Prisma.StudentWhereInput = {
      ...(q.batchId ? { batchId: q.batchId } : {}),
      ...(q.status === 'ACTIVE' || q.status === 'INACTIVE' ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { parentName: { contains: q.search, mode: 'insensitive' } },
              { parentPhone: { contains: q.search } },
            ],
          }
        : {}),
    };
    const ledgers = await this.dues.ledgers(centerId, month, where);
    return ledgers.map(({ student, fee, ledger }) => ({
      id: student.id,
      name: student.name,
      parentName: student.parentName,
      parentPhone: student.parentPhone,
      status: student.status,
      batchId: student.batchId,
      batchName: student.batch.name,
      joinedOn: toDateStr(student.joinedOn),
      monthlyFee: Math.max(0, fee.monthlyFee - fee.discount),
      outstanding: ledger.outstanding,
      advance: ledger.advance,
    }));
  }

  async create(centerId: string, dto: CreateStudentDto) {
    await this.assertBatch(centerId, dto.batchId);
    const { fee, student } = split(dto);
    if (dto.status === 'INACTIVE' && !dto.leftOn) student.leftOn = toDbDate(todayIST());
    const created = await this.prisma.student.create({
      data: {
        ...(student as Prisma.StudentUncheckedCreateInput),
        name: dto.name.trim(),
        centerId,
        feeRule: { create: fee as Prisma.FeeRuleCreateWithoutStudentInput },
      },
    });
    return this.get(centerId, created.id);
  }

  async get(centerId: string, id: string) {
    const today = todayIST();
    const month = monthOf(today);
    const [sl] = await this.dues.ledgers(centerId, month, { id });
    if (!sl) throw new NotFoundException('Student not found');
    const [payments, attendance, reminders] = await Promise.all([
      this.prisma.payment.findMany({ where: { studentId: id }, orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }] }),
      this.prisma.attendance.findMany({
        where: { studentId: id, date: { gte: toDbDate(firstDay(month)), lte: toDbDate(lastDay(month)) } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.reminder.findMany({ where: { studentId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    const { student, fee, ledger } = sl;
    const center = await this.prisma.center.findUniqueOrThrow({ where: { id: centerId } });
    const reminderText = renderMessage('GENERIC_DUE', center.language, {
      parentName: student.parentName,
      studentName: student.name,
      centerName: center.name,
      amount: ledger.outstanding,
      month,
      upiId: center.upiId,
    });
    return {
      id: student.id,
      name: student.name,
      parentName: student.parentName,
      parentPhone: student.parentPhone,
      status: student.status,
      batchId: student.batchId,
      batch: { id: student.batch.id, name: student.batch.name, defaultMonthlyFee: student.batch.defaultMonthlyFee },
      joinedOn: toDateStr(student.joinedOn),
      leftOn: student.leftOn ? toDateStr(student.leftOn) : null,
      notes: student.notes,
      allowReminders: student.allowReminders,
      feeRule: {
        monthlyFee: student.feeRule?.monthlyFee ?? null,
        discount: fee.discount,
        discountReason: student.feeRule?.discountReason ?? null,
        dueDay: fee.dueDay,
        proRateFirstMonth: fee.proRateFirstMonth,
        effectiveMonthlyFee: Math.max(0, fee.monthlyFee - fee.discount),
      },
      ledger: {
        ...ledger,
        months: [...ledger.months].reverse(),
        advanceMonths: monthsCoveredByAdvance(fee, ledger.advance, month),
      },
      payments: payments.map((p) => ({ ...p, paidOn: toDateStr(p.paidOn) })),
      attendance: {
        month,
        present: attendance.filter((a) => a.present).length,
        total: attendance.length,
        days: attendance.map((a) => ({ date: toDateStr(a.date), present: a.present })),
      },
      reminders,
      reminderLink: ledger.outstanding > 0 ? waLink(student.parentPhone, reminderText) : null,
    };
  }

  async update(centerId: string, id: string, dto: UpdateStudentDto) {
    const existing = await this.assertStudent(centerId, id);
    if (dto.batchId) await this.assertBatch(centerId, dto.batchId);
    const { fee, student } = split(dto);
    if (dto.status === 'INACTIVE' && existing.status === 'ACTIVE' && dto.leftOn === undefined) {
      student.leftOn = toDbDate(todayIST());
    }
    if (dto.status === 'ACTIVE' && existing.status === 'INACTIVE' && dto.leftOn === undefined) {
      student.leftOn = null;
    }
    await this.prisma.student.update({
      where: { id },
      data: {
        ...student,
        feeRule: { upsert: { create: fee as Prisma.FeeRuleCreateWithoutStudentInput, update: fee as Prisma.FeeRuleUpdateWithoutStudentInput } },
      },
    });
    return this.get(centerId, id);
  }

  async remove(centerId: string, id: string) {
    await this.assertStudent(centerId, id);
    await this.prisma.student.delete({ where: { id } });
    return { ok: true };
  }
}

@Controller('students')
export class StudentsController {
  constructor(private readonly svc: StudentsService) {}

  @Get() list(
    @CurrentUser() u: AuthUser,
    @Query('batchId') batchId?: string,
    @Query('status') status?: string,
    @Query('q') search?: string,
  ) {
    return this.svc.list(u.centerId, { batchId, status, search });
  }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateStudentDto) {
    return this.svc.create(u.centerId, dto);
  }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.get(u.centerId, id);
  }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.svc.update(u.centerId, id, dto);
  }
  @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u.centerId, id);
  }
}

@Module({
  imports: [DuesModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
