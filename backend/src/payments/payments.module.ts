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
  Post,
  Query,
} from '@nestjs/common';
import { PaymentMode, Prisma } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/auth';
import { firstDay, isValidMonth, lastDay, monthOf, toDateStr, toDbDate, todayIST } from '../common/dates';
import { IsDateString, IsMonthString } from '../common/validators';
import { DuesModule, DuesService } from '../dues/dues.module';
import { PrismaService } from '../prisma/prisma.service';
import { renderMessage, waLink } from '../reminders/messages';

export class CreatePaymentDto {
  @IsString() studentId!: string;
  @IsInt() @Min(1) @Max(10_000_000) amount!: number;
  @IsEnum(PaymentMode) mode!: PaymentMode;
  @IsOptional() @IsDateString() paidOn?: string;
  @IsOptional() @IsMonthString() forMonth?: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dues: DuesService,
  ) {}

  async list(centerId: string, q: { studentId?: string; month?: string }) {
    if (q.month && !isValidMonth(q.month)) throw new BadRequestException('month must be YYYY-MM');
    const where: Prisma.PaymentWhereInput = {
      centerId,
      ...(q.studentId ? { studentId: q.studentId } : {}),
      ...(q.month ? { paidOn: { gte: toDbDate(firstDay(q.month)), lte: toDbDate(lastDay(q.month)) } } : {}),
    };
    const rows = await this.prisma.payment.findMany({
      where,
      include: { student: { select: { name: true, batch: { select: { name: true } } } } },
      orderBy: [{ paidOn: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    return rows.map(({ student, ...p }) => ({
      ...p,
      paidOn: toDateStr(p.paidOn),
      studentName: student.name,
      batchName: student.batch.name,
    }));
  }

  async create(centerId: string, dto: CreatePaymentDto) {
    const today = todayIST();
    const paidOn = dto.paidOn ?? today;
    if (paidOn > today) throw new BadRequestException('Payment date cannot be in the future');
    const student = await this.prisma.student.findFirst({ where: { id: dto.studentId, centerId } });
    if (!student) throw new NotFoundException('Student not found');

    const payment = await this.prisma.payment.create({
      data: { ...dto, paidOn: toDbDate(paidOn), forMonth: dto.forMonth ?? monthOf(paidOn), centerId },
    });

    // Return updated balance and a ready-to-send WhatsApp receipt
    const month = monthOf(today);
    const [sl] = await this.dues.ledgers(centerId, month, { id: student.id });
    const center = await this.prisma.center.findUniqueOrThrow({ where: { id: centerId } });
    const receipt = renderMessage('RECEIPT', center.language, {
      parentName: student.parentName,
      studentName: student.name,
      centerName: center.name,
      amount: payment.amount,
      month,
      paidOn,
      balance: sl.ledger.outstanding,
    });
    return {
      payment: { ...payment, paidOn },
      outstanding: sl.ledger.outstanding,
      advance: sl.ledger.advance,
      receiptText: receipt,
      receiptLink: waLink(student.parentPhone, receipt),
    };
  }

  async remove(centerId: string, id: string) {
    const p = await this.prisma.payment.findFirst({ where: { id, centerId } });
    if (!p) throw new NotFoundException('Payment not found');
    await this.prisma.payment.delete({ where: { id } });
    return { ok: true };
  }
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly svc: PaymentsService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Query('studentId') studentId?: string, @Query('month') month?: string) {
    return this.svc.list(u.centerId, { studentId, month });
  }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreatePaymentDto) {
    return this.svc.create(u.centerId, dto);
  }
  @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u.centerId, id);
  }
}

@Module({ imports: [DuesModule], controllers: [PaymentsController], providers: [PaymentsService] })
export class PaymentsModule {}
