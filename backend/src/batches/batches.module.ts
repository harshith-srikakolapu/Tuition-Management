import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { Prisma } from '@prisma/client';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/auth';
import { PrismaService } from '../prisma/prisma.service';

export class CreateBatchDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(120) schedule?: string;
  @IsInt() @Min(0) @Max(1_000_000) defaultMonthlyFee!: number;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class UpdateBatchDto extends PartialType(CreateBatchDto) {}

@Injectable()
export class BatchesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(centerId: string) {
    const batches = await this.prisma.batch.findMany({
      where: { centerId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { students: { where: { status: 'ACTIVE' } } } } },
    });
    return batches.map(({ _count, ...b }) => ({ ...b, activeStudents: _count.students }));
  }

  async get(centerId: string, id: string) {
    const b = await this.prisma.batch.findFirst({ where: { id, centerId } });
    if (!b) throw new NotFoundException('Batch not found');
    return b;
  }

  async create(centerId: string, dto: CreateBatchDto) {
    try {
      return await this.prisma.batch.create({ data: { ...dto, name: dto.name.trim(), centerId } });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async update(centerId: string, id: string, dto: UpdateBatchDto) {
    await this.get(centerId, id);
    try {
      return await this.prisma.batch.update({ where: { id }, data: dto });
    } catch (e) {
      throw this.mapError(e);
    }
  }

  async remove(centerId: string, id: string) {
    await this.get(centerId, id);
    const count = await this.prisma.student.count({ where: { batchId: id } });
    if (count > 0) throw new ConflictException('This batch has students. Move them or archive the batch instead.');
    await this.prisma.batch.delete({ where: { id } });
    return { ok: true };
  }

  private mapError(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException('A batch with this name already exists');
    }
    return e;
  }
}

@Controller('batches')
export class BatchesController {
  constructor(private readonly svc: BatchesService) {}

  @Get() list(@CurrentUser() u: AuthUser) {
    return this.svc.list(u.centerId);
  }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateBatchDto) {
    return this.svc.create(u.centerId, dto);
  }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateBatchDto) {
    return this.svc.update(u.centerId, id, dto);
  }
  @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u.centerId, id);
  }
}

@Module({ controllers: [BatchesController], providers: [BatchesService], exports: [BatchesService] })
export class BatchesModule {}
