import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthRequest } from './auth';
export const RequirePermission = (value: string) => SetMetadata('permission', value);
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const permission = this.reflector.getAllAndOverride<string>('permission', [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<AuthRequest>();
    if (permission && !req.permissions?.includes(permission))
      throw new ForbiddenException('Permission required');
    return true;
  }
}
@Injectable()
export class VerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    if (
      (process.env.NODE_ENV === 'production' || process.env.REQUIRE_VERIFIED_EMAIL === 'true') &&
      !req.account.emailVerifiedAt
    )
      throw new ForbiddenException('Verify your email before participating');
    return true;
  }
}
