import { BadRequestException, Body, Controller, Get, Injectable, Module, Put, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsString, ValidateNested } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/auth';
import { firstDay, isValidDate, lastDay, monthOf, toDateStr, toDbDate, todayIST } from '../common/dates';
import { IsDateString } from '../common/validators';
import { parseMonthParam } from '../dues/dues.module';
import { PrismaService } from '../prisma/prisma.service';

class AttendanceEntry {
  @IsString() studentId!: string;
  @IsBoolean() present!: boolean;
}

export class SaveAttendanceDto {
  @IsDateString() date!: string;
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => AttendanceEntry) entries!: AttendanceEntry[];
}

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Students enrolled in the batch on `date`, with their mark (null = not marked yet). */
  async sheet(centerId: string, batchId: string, date: string) {
    const d = toDbDate(date);
    const students = await this.prisma.student.findMany({
      where: {
        centerId,
        batchId,
        joinedOn: { lte: d },
        OR: [{ leftOn: null }, { leftOn: { gte: d } }],
      },
      include: { attendance: { where: { date: d } } },
      orderBy: { name: 'asc' },
    });
    return {
      date,
      batchId,
      students: students.map((s) => ({ id: s.id, name: s.name, present: s.attendance[0]?.present ?? null })),
    };
  }

  async save(centerId: string, dto: SaveAttendanceDto) {
    if (dto.date > todayIST()) throw new BadRequestException('Cannot mark attendance for a future date');
    const ids = [...new Set(dto.entries.map((e) => e.studentId))];
    const owned = await this.prisma.student.count({ where: { id: { in: ids }, centerId } });
    if (owned !== ids.length) throw new BadRequestException('Unknown student in attendance list');
    const date = toDbDate(dto.date);
    await this.prisma.$transaction(
      dto.entries.map((e) =>
        this.prisma.attendance.upsert({
          where: { studentId_date: { studentId: e.studentId, date } },
          create: { studentId: e.studentId, date, present: e.present },
          update: { present: e.present },
        }),
      ),
    );
    return { ok: true, saved: dto.entries.length };
  }

  /** Per-student attendance % for a month. */
  async summary(centerId: string, month: string, batchId?: string) {
    const students = await this.prisma.student.findMany({
      where: { centerId, ...(batchId ? { batchId } : {}) },
      include: {
        batch: { select: { name: true } },
        attendance: { where: { date: { gte: toDbDate(firstDay(month)), lte: toDbDate(lastDay(month)) } } },
      },
      orderBy: { name: 'asc' },
    });
    return students
      .filter((s) => s.attendance.length > 0)
      .map((s) => {
        const present = s.attendance.filter((a) => a.present).length;
        return {
          studentId: s.id,
          name: s.name,
          batchName: s.batch.name,
          present,
          total: s.attendance.length,
          percent: Math.round((present / s.attendance.length) * 100),
          absentDates: s.attendance.filter((a) => !a.present).map((a) => toDateStr(a.date)),
        };
      });
  }
}

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly svc: AttendanceService) {}

  @Get() sheet(@CurrentUser() u: AuthUser, @Query('batchId') batchId: string, @Query('date') date?: string) {
    if (!batchId) throw new BadRequestException('batchId is required');
    const d = date ?? todayIST();
    if (!isValidDate(d)) throw new BadRequestException('date must be YYYY-MM-DD');
    return this.svc.sheet(u.centerId, batchId, d);
  }

  @Put() save(@CurrentUser() u: AuthUser, @Body() dto: SaveAttendanceDto) {
    return this.svc.save(u.centerId, dto);
  }

  @Get('summary') summary(@CurrentUser() u: AuthUser, @Query('month') month?: string, @Query('batchId') batchId?: string) {
    return this.svc.summary(u.centerId, parseMonthParam(month ?? monthOf(todayIST())), batchId);
  }
}

@Module({ controllers: [AttendanceController], providers: [AttendanceService], exports: [AttendanceService] })
export class AttendanceModule {}
