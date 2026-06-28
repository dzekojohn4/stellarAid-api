import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './decorators/public.decorator';

/**
 * Single, project-wide JWT authentication guard. Honours the `@Public()`
 * metadata shortcut from `decorators/public.decorator.ts` so endpoint
 * authors can opt out of auth on a per-route basis without redeclaring
 * guards.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(err: unknown, user: unknown, info: unknown) {
    if (err || !user) {
      throw (
        (err as Error) ?? new UnauthorizedException('Invalid or expired token')
      );
    }
    return user;
  }
}
