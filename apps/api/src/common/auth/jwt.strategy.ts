import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, type StrategyOptionsWithoutRequest } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import type { AppConfig } from '../config/configuration';
import { UserDirectoryService } from './user-directory.service';
import type { RequestUser } from './types';

/**
 * Επικύρωση access token του Authentik μέσω JWKS.
 *
 * Το token απαντά **μόνο** «ποιος είσαι». Το «τι μπορείς» έρχεται από τον
 * λογαριασμό στη βάση, που τον όρισε ο υπερδιαχειριστής — γι' αυτό δεν
 * διαβάζουμε groups ούτε άλλα claims εξουσιοδότησης.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: AppConfig,
    private readonly directory: UserDirectoryService,
  ) {
    const options: StrategyOptionsWithoutRequest = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      issuer: config.OIDC_ISSUER,
      audience: config.OIDC_AUDIENCE,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: config.OIDC_JWKS_URI,
      }),
    };
    super(options);
  }

  async validate(payload: Record<string, unknown>): Promise<RequestUser> {
    const ssoId = asString(payload.sub);
    const email = asString(payload.email);

    if (!ssoId) throw new UnauthorizedException('Το token δεν περιέχει sub.');
    // Χωρίς email δεν μπορούμε να δέσουμε την ταυτότητα με λογαριασμό της
    // εφαρμογής· ζητάμε ρητά το scope `email` από το Authentik.
    if (!email) throw new UnauthorizedException('Το token δεν περιέχει email.');

    return this.directory.resolveFromToken({
      ssoId,
      email,
      firstName: asString(payload.given_name) ?? asString(payload.name),
      lastName: asString(payload.family_name),
    });
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
