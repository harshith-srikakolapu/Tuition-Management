import {
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Module,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AuthUser, CurrentUser, JwtPayload, Public } from '../common/auth';
import { PrismaService } from '../prisma/prisma.service';
import { SUPPORTED_LANGUAGES } from '../reminders/messages';

const lower = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

export class SignupDto {
  @IsString() @MinLength(2) @MaxLength(100) centerName!: string;
  @IsString() @MinLength(2) @MaxLength(100) ownerName!: string;
  @lower() @IsEmail() email!: string;
  @IsString() @MinLength(8, { message: 'password must be at least 8 characters' }) password!: string;
}

export class LoginDto {
  @lower() @IsEmail() email!: string;
  @IsString() password!: string;
}

export class UpdateCenterDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @Matches(/^[\w.-]+@[\w.-]+$/, { message: 'upiId must look like name@bank' }) upiId?: string;
  @IsOptional() @IsIn(SUPPORTED_LANGUAGES) language?: string;
  @IsOptional() @IsBoolean() remindersEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(15) remindDaysBefore?: number;
  @IsOptional() @IsInt() @Min(0) @Max(30) remindDaysAfter?: number;
}

const PUBLIC_USER = { id: true, name: true, email: true } as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private sign(userId: string, centerId: string) {
    return this.jwt.signAsync({ sub: userId, centerId } satisfies JwtPayload);
  }

  async signup(dto: SignupDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('An account with this email already exists');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const center = await this.prisma.center.create({
      data: { name: dto.centerName.trim(), users: { create: { name: dto.ownerName.trim(), email: dto.email, passwordHash } } },
      include: { users: { select: PUBLIC_USER } },
    });
    const { users, ...centerData } = center;
    return { token: await this.sign(users[0].id, center.id), user: users[0], center: centerData };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email }, include: { center: true } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Wrong email or password');
    }
    return {
      token: await this.sign(user.id, user.centerId),
      user: { id: user.id, name: user.name, email: user.email },
      center: user.center,
    };
  }

  async me(u: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: u.userId }, select: { ...PUBLIC_USER, center: true } });
    if (!user) throw new UnauthorizedException();
    const { center, ...rest } = user;
    return { user: rest, center };
  }

  updateCenter(u: AuthUser, dto: UpdateCenterDto) {
    return this.prisma.center.update({ where: { id: u.centerId }, data: dto });
  }
}

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @Post('auth/signup') signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Public() @Post('auth/login') login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('auth/me') me(@CurrentUser() u: AuthUser) {
    return this.auth.me(u);
  }

  @Patch('center') updateCenter(@CurrentUser() u: AuthUser, @Body() dto: UpdateCenterDto) {
    return this.auth.updateCenter(u, dto);
  }
}

@Module({ controllers: [AuthController], providers: [AuthService] })
export class AuthModule {}
