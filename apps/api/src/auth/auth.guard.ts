import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import type { AuthPrincipal } from './auth.types';

export interface AuthenticatedRequest extends Request {
  auth?: AuthPrincipal;
}

@Injectable()
export class AuthGuard implements CanActivate {
  public constructor(private readonly authService: AuthService) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.header('authorization');
    if (authorization === undefined || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid session');
    }
    request.auth = await this.authService.authenticate(authorization.slice('Bearer '.length));
    return true;
  }
}
