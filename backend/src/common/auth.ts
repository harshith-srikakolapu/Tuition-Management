import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

export interface JwtPayload {
  sub: string; // user id
  centerId: string;
}

export interface AuthUser {
  userId: string;
  centerId: string;
}

const IS_PUBLIC = 'isPublic';
/** Mark a route as not requiring a login. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Injects the logged-in user; every query must be scoped by `user.centerId`. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const [type, token] = String(req.headers.authorization ?? '').split(' ');
    if (type !== 'Bearer' || !token) throw new UnauthorizedException('Please log in');
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      req.user = { userId: payload.sub, centerId: payload.centerId } satisfies AuthUser;
      return true;
    } catch {
      throw new UnauthorizedException('Session expired, please log in again');
    }
  }
}
