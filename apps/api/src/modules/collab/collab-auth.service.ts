import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwksClient } from 'jwks-rsa';
import { AppConfigToken } from '../../common/config/config.module';
import type { AppConfig } from '../../common/config/configuration';
import { tokenIdentity } from '../../common/auth/jwt.strategy';
import { UserDirectoryService } from '../../common/auth/user-directory.service';
import type { RequestUser } from '../../common/auth/types';

export interface CollabIdentity {
  user: RequestUser;
  /** Πότε λήγει το token (ms) — τότε κλείνει και η σύνδεση. `null` στο dev bypass. */
  expiresAt: number | null;
}

/**
 * Γιατί δεν έγινε δεκτό: `invalid` = άκυρο ή ληγμένο token (ο client το ανανεώνει),
 * `no-access` = ο λογαριασμός δεν έχει πια πρόσβαση (ένα νέο token δεν αλλάζει τίποτα).
 */
export type CollabVerifyFailure = 'invalid' | 'no-access';

/**
 * Ποιος συνδέεται στο WebSocket της συνεργασίας.
 *
 * Ίδιος έλεγχος με το `JwtStrategy` των HTTP αιτημάτων — υπογραφή από το JWKS
 * του Authentik, issuer, audience, λήξη — και ίδιο δέσιμο με λογαριασμό. Το
 * token δεν μπαίνει ποτέ στο URL (θα έμενε σε logs proxy): έρχεται μέσα στη
 * σύνδεση, ανά έγγραφο.
 */
@Injectable()
export class CollabAuthService {
  private readonly jwt = new JwtService();
  private readonly jwks: JwksClient | null;

  constructor(
    @Inject(AppConfigToken) private readonly config: AppConfig,
    private readonly directory: UserDirectoryService,
  ) {
    this.jwks = config.DEV_AUTH_BYPASS
      ? null
      : new JwksClient({ jwksUri: config.OIDC_JWKS_URI, cache: true, rateLimit: true, jwksRequestsPerMinute: 10 });
  }

  /** Ο λογαριασμός του token — ή γιατί δεν έγινε δεκτό. */
  async verify(token: string): Promise<CollabIdentity | CollabVerifyFailure> {
    try {
      if (!this.jwks) {
        // Dev bypass: ο client στέλνει το email του λογαριασμού, όπως το `x-dev-email`.
        const email = token.includes('@') ? token : this.config.DEV_AUTH_EMAIL;
        return { user: await this.directory.resolveFromToken({ email }), expiresAt: null };
      }
      const decoded = this.jwt.decode<{ header?: { kid?: string } } | null>(token, { complete: true });
      const key = await this.jwks.getSigningKey(decoded?.header?.kid);
      const payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        publicKey: key.getPublicKey(),
        algorithms: ['RS256'],
        issuer: this.config.OIDC_ISSUER,
        audience: this.config.OIDC_AUDIENCE,
      });
      const user = await this.directory.resolveFromToken(tokenIdentity(payload));
      return { user, expiresAt: typeof payload.exp === 'number' ? payload.exp * 1000 : null };
    } catch (error) {
      return error instanceof ForbiddenException ? 'no-access' : 'invalid';
    }
  }
}
