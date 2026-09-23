import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';
import { AppConfigToken } from '../../common/config/config.module';
import type { AppConfig } from '../../common/config/configuration';

const tokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.coerce.number().default(60),
  refresh_token: z.string().optional(),
});

/**
 * Αυθεντικοποίηση στο e-SEO μέσω Keycloak.
 *
 * Δεν αποθηκεύουμε κωδικό στελέχους: κρατάμε ένα **offline refresh token** και
 * με αυτό εκδίδουμε access tokens όσο ζει η διεργασία. Το access token
 * ζωντανεύει ~1 λεπτό, οπότε το cache-άρουμε μέχρι λίγο πριν λήξει αντί να
 * κάνουμε refresh σε κάθε κλήση.
 */
@Injectable()
export class EseoAuth {
  private readonly logger = new Logger(EseoAuth.name);
  private refreshToken?: string;
  private cached?: { token: string; expiresAt: number };
  private inFlight?: Promise<string>;

  constructor(
    private readonly http: HttpService,
    @Inject(AppConfigToken) private readonly config: AppConfig,
  ) {
    this.refreshToken = config.ESEO_REFRESH_TOKEN;
  }

  get configured(): boolean {
    return Boolean(this.config.ESEO_BASE_URL && this.refreshToken);
  }

  /** Έγκυρο access token — από cache ή με νέο refresh. */
  async accessToken(): Promise<string> {
    if (this.cached && Date.now() < this.cached.expiresAt) {
      return this.cached.token;
    }
    // Ένα refresh τη φορά: ο sync κάνει πολλές παράλληλες σελίδες και δεν θέλουμε
    // καταιγισμό ταυτόχρονων refresh με το ίδιο (ίσως rotating) token.
    this.inFlight ??= this.refresh().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private get tokenUrl(): string {
    const base = this.config.ESEO_BASE_URL!.replace(/\/$/, '');
    return `${base}/auth/realms/${this.config.ESEO_REALM}/protocol/openid-connect/token`;
  }

  private async refresh(): Promise<string> {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Το e-SEO δεν έχει ρυθμιστεί (ESEO_BASE_URL / ESEO_REFRESH_TOKEN).',
      );
    }

    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.ESEO_CLIENT_ID,
        refresh_token: this.refreshToken!,
      });

      const response = await firstValueFrom(
        this.http.post<unknown>(this.tokenUrl, body.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 20_000,
        }),
      );

      const parsed = tokenSchema.parse(response.data);
      this.cached = {
        token: parsed.access_token,
        // Περιθώριο 30 δλ ώστε να μη χρησιμοποιηθεί token που λήγει μεσοδρομίς.
        expiresAt: Date.now() + Math.max(parsed.expires_in - 30, 5) * 1000,
      };

      // Αν ο Keycloak περιστρέφει τα refresh tokens, χρησιμοποιούμε το νέο για
      // την υπόλοιπη ζωή της διεργασίας — αλλά η επανεκκίνηση θα ξαναδιαβάσει το
      // παλιό από το .env, οπότε προειδοποιούμε να ενημερωθεί.
      if (parsed.refresh_token && parsed.refresh_token !== this.refreshToken) {
        this.refreshToken = parsed.refresh_token;
        this.logger.warn(
          'Το e-SEO περιέστρεψε το refresh token — ενημέρωσε το ESEO_REFRESH_TOKEN στο .env ' +
            'για να επιβιώσει μετά από επανεκκίνηση.',
        );
      }

      return parsed.access_token;
    } catch (error) {
      this.cached = undefined;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Αποτυχία αυθεντικοποίησης e-SEO: ${message}`);
      throw new ServiceUnavailableException(
        'Δεν ήταν δυνατή η αυθεντικοποίηση στο e-SEO (έληξε ή ανακλήθηκε το refresh token;).',
      );
    }
  }
}
