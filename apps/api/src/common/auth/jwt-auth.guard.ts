import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import type { AppConfig } from '../config/configuration';
import { DevAuthService } from './dev-auth.service';
import { PUBLIC_KEY } from './decorators';

/**
 * Καθολικό guard αυθεντικοποίησης. Δουλεύει σε δύο τρόπους:
 *  * κανονικά, επικυρώνει Bearer JWT του Authentik (strategy `jwt`)·
 *  * με `DEV_AUTH_BYPASS`, γεμίζει `request.user` με τον dev χρήστη.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: AppConfig,
    private readonly devAuth: DevAuthService | null,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    if (this.config.DEV_AUTH_BYPASS) {
      if (!this.devAuth) throw new UnauthorizedException('DEV_AUTH_BYPASS χωρίς διαθέσιμο πάροχο.');
      const request = context.switchToHttp().getRequest<Request>();
      request.user = await this.devAuth.resolve(request);
      return true;
    }

    return (await super.canActivate(context)) as boolean;
  }
}
