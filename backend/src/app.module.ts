import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { AttendanceModule } from './attendance/attendance.module';
import { AuthModule } from './auth/auth.module';
import { BatchesModule } from './batches/batches.module';
import { AuthGuard, Public } from './common/auth';
import { DuesModule } from './dues/dues.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.service';
import { RemindersModule } from './reminders/reminders.module';
import { ReportsModule } from './reports/reports.module';
import { StudentsModule } from './students/students.module';

function jwtSecret(): string {
  const s = process.env.SECRET_KEY;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('SECRET_KEY must be set in production');
  return 'dev-only-secret-change-me';
}

@Controller('health')
class HealthController {
  @Public() @Get() health() {
    return { ok: true };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({ global: true, useFactory: () => ({ secret: jwtSecret(), signOptions: { expiresIn: '30d' } }) }),
    PrismaModule,
    AuthModule,
    BatchesModule,
    StudentsModule,
    PaymentsModule,
    DuesModule,
    AttendanceModule,
    RemindersModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
