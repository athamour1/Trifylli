import { HttpService } from '@nestjs/axios';
import { BadRequestException, Inject, Injectable, Logger, type OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';
import { AppConfigToken } from '../../common/config/config.module';
import type { AppConfig } from '../../common/config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SecretBox } from '../../common/util/secret-box';

const tokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.coerce.number().default(60),
  refresh_token: z.string().optional(),
});

type TokenResponse = z.infer<typeof tokenSchema>;

/** Η μία γραμμή του `EseoCredential`. */
const CREDENTIAL_ID = 'eseo';

/** Ο λογαριασμός e-SEO όπως τον βλέπει ο υπερδιαχειριστής — ποτέ κωδικός ή token. */
export interface EseoAccountStatus {
  /** Από πού συνδέεται το API: λογαριασμός από τις Ενσωματώσεις, παλιό token στο `.env`, ή τίποτα. */
  source: 'account' | 'env' | null;
  username: string | null;
  loggedInAt: Date | null;
  lastError: string | null;
}

/**
 * Αυθεντικοποίηση στο e-SEO μέσω Keycloak.
 *
 * Ο υπερδιαχειριστής συνδέεται από τις Ενσωματώσεις με όνομα και κωδικό· τα
 * κρατάμε κρυπτογραφημένα (`SecretBox`) μαζί με ένα **offline refresh token**.
 * Με το token εκδίδουμε access tokens (ζουν ~1 λεπτό, οπότε τα cache-άρουμε)·
 * όταν το token λήξει ή ανακληθεί, ξανασυνδεόμαστε μόνοι μας με τον κωδικό, ώστε
 * ο νυχτερινός συγχρονισμός να μη σταματά ποτέ.
 *
 * Παλιός τρόπος, όσο δεν υπάρχει λογαριασμός: `ESEO_REFRESH_TOKEN` στο `.env`.
 */
@Injectable()
export class EseoAuth implements OnModuleInit {
  private readonly logger = new Logger(EseoAuth.name);
  private readonly box: SecretBox;
  /** Ο λογαριασμός από τη βάση, ανοιγμένος — ένα instance του API, άρα αρκεί η μνήμη. */
  private account?: { username: string; password: string; refreshToken?: string };
  private envToken?: string;
  private cached?: { token: string; expiresAt: number };
  private inFlight?: Promise<string>;
  private lastError: string | null = null;
  private loggedInAt: Date | null = null;

  constructor(
    private readonly http: HttpService,
    @Inject(AppConfigToken) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {
    this.envToken = config.ESEO_REFRESH_TOKEN;
    this.box = SecretBox.fromConfig(config);
  }

  async onModuleInit(): Promise<void> {
    const row = await this.prisma.eseoCredential.findUnique({ where: { id: CREDENTIAL_ID } }).catch(() => null);
    if (!row) return;
    this.loggedInAt = row.loggedInAt;
    this.lastError = row.lastError;
    const password = this.box.open(row.password);
    if (password === null) {
      // Άλλαξε το κλειδί (SECRETS_KEY ή κωδικός βάσης): ο κωδικός δεν διαβάζεται.
      this.lastError = 'Τα αποθηκευμένα στοιχεία δεν διαβάζονται πια (άλλαξε το κλειδί) — συνδέσου ξανά.';
      this.logger.warn('Ο κωδικός e-SEO στη βάση δεν ανοίγει με το τρέχον κλειδί.');
      return;
    }
    const refreshToken = row.refreshToken ? (this.box.open(row.refreshToken) ?? undefined) : undefined;
    this.account = { username: row.username, password, refreshToken };
  }

  get configured(): boolean {
    return Boolean(this.config.ESEO_BASE_URL && (this.account || this.envToken));
  }

  status(): EseoAccountStatus {
    return {
      source: this.account ? 'account' : this.envToken ? 'env' : null,
      username: this.account?.username ?? null,
      loggedInAt: this.account ? this.loggedInAt : null,
      lastError: this.lastError,
    };
  }

  /** Έγκυρο access token — από cache ή με νέο refresh (ή νέα σύνδεση). */
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

  /**
   * Σύνδεση με όνομα και κωδικό από τις Ενσωματώσεις. Ελέγχεται αμέσως στο
   * Keycloak· μόνο αν περάσει αποθηκεύεται (και αντικαθιστά τον προηγούμενο).
   */
  async login(username: string, password: string, byUserId: string): Promise<EseoAccountStatus> {
    if (!this.config.ESEO_BASE_URL) {
      throw new BadRequestException('Λείπει το ESEO_BASE_URL — το API δεν ξέρει πού είναι το e-SEO.');
    }
    let token: TokenResponse;
    try {
      token = await this.passwordGrant(username, password);
    } catch (error) {
      throw new BadRequestException(this.describe(error));
    }
    if (!token.refresh_token) {
      throw new BadRequestException('Το e-SEO δεν έδωσε offline token για αυτόν τον λογαριασμό.');
    }
    const now = new Date();
    const data = {
      username,
      password: this.box.seal(password),
      refreshToken: this.box.seal(token.refresh_token),
      loggedInAt: now,
      lastError: null,
      updatedById: byUserId,
    };
    await this.prisma.eseoCredential.upsert({ where: { id: CREDENTIAL_ID }, create: { id: CREDENTIAL_ID, ...data }, update: data });
    this.account = { username, password, refreshToken: token.refresh_token };
    this.loggedInAt = now;
    this.lastError = null;
    this.remember(token);
    this.logger.log(`Σύνδεση στο e-SEO ως ${username}.`);
    return this.status();
  }

  /** Αποσύνδεση: σβήνει όνομα, κωδικό και token από τη βάση. */
  async logout(): Promise<EseoAccountStatus> {
    await this.prisma.eseoCredential.deleteMany({ where: { id: CREDENTIAL_ID } });
    this.account = undefined;
    this.cached = undefined;
    this.lastError = null;
    this.loggedInAt = null;
    return this.status();
  }

  private get tokenUrl(): string {
    const base = this.config.ESEO_BASE_URL!.replace(/\/$/, '');
    return `${base}/auth/realms/${this.config.ESEO_REALM}/protocol/openid-connect/token`;
  }

  private async grant(params: Record<string, string>): Promise<TokenResponse> {
    const body = new URLSearchParams({ client_id: this.config.ESEO_CLIENT_ID, ...params });
    const response = await firstValueFrom(
      this.http.post<unknown>(this.tokenUrl, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 20_000,
      }),
    );
    return tokenSchema.parse(response.data);
  }

  private passwordGrant(username: string, password: string): Promise<TokenResponse> {
    return this.grant({ grant_type: 'password', scope: 'openid offline_access', username, password });
  }

  private remember(token: TokenResponse): void {
    this.cached = {
      token: token.access_token,
      // Περιθώριο 30 δλ ώστε να μη χρησιμοποιηθεί token που λήγει μεσοδρομίς.
      expiresAt: Date.now() + Math.max(token.expires_in - 30, 5) * 1000,
    };
  }

  /** Το σφάλμα του Keycloak στα ελληνικά — χωρίς μυστικά. */
  private describe(error: unknown, grant: 'password' | 'token' = 'password'): string {
    if (isAxiosError(error)) {
      const data = error.response?.data as { error?: string; error_description?: string } | undefined;
      if (data?.error === 'invalid_grant') return grant === 'password' ? 'Λάθος όνομα χρήστη ή κωδικός e-SEO.' : 'έληξε ή ανακλήθηκε';
      if (data?.error) return `Το e-SEO απάντησε: ${data.error_description ?? data.error}`;
      if (!error.response) return 'Το e-SEO δεν απαντά — δοκίμασε ξανά σε λίγο.';
      return `Το e-SEO απάντησε ${error.response.status}.`;
    }
    return error instanceof Error ? error.message : String(error);
  }

  private async refresh(): Promise<string> {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Το e-SEO δεν έχει ρυθμιστεί — σύνδεσε λογαριασμό από τις Ενσωματώσεις.',
      );
    }
    return this.account ? this.refreshAccount(this.account) : this.refreshEnv(this.envToken!);
  }

  /** Με το token του λογαριασμού· αν δεν περάσει, νέα σύνδεση με τον κωδικό. */
  private async refreshAccount(account: NonNullable<EseoAuth['account']>): Promise<string> {
    let token: TokenResponse | null = null;
    if (account.refreshToken) {
      try {
        token = await this.grant({ grant_type: 'refresh_token', refresh_token: account.refreshToken });
      } catch (error) {
        this.logger.warn(`Το refresh token του e-SEO δεν πέρασε (${this.describe(error, 'token')}) — νέα σύνδεση με κωδικό.`);
      }
    }
    if (!token) {
      try {
        token = await this.passwordGrant(account.username, account.password);
        this.loggedInAt = new Date();
      } catch (error) {
        this.cached = undefined;
        const message = this.describe(error);
        this.lastError = message;
        this.logger.error(`Αποτυχία σύνδεσης e-SEO: ${message}`);
        await this.prisma.eseoCredential
          .updateMany({ where: { id: CREDENTIAL_ID }, data: { lastError: message } })
          .catch(() => undefined);
        throw new ServiceUnavailableException(`Δεν ήταν δυνατή η σύνδεση στο e-SEO: ${message}`);
      }
    }
    this.remember(token);
    const rotated = token.refresh_token && token.refresh_token !== account.refreshToken ? token.refresh_token : null;
    if (rotated) account.refreshToken = rotated;
    if (rotated || this.lastError) {
      this.lastError = null;
      await this.prisma.eseoCredential
        .updateMany({
          where: { id: CREDENTIAL_ID },
          data: { lastError: null, loggedInAt: this.loggedInAt, ...(rotated ? { refreshToken: this.box.seal(rotated) } : {}) },
        })
        .catch((error: unknown) => this.logger.warn(`Το νέο token του e-SEO δεν σώθηκε: ${String(error)}`));
    }
    return token.access_token;
  }

  /** Παλιός τρόπος: το `ESEO_REFRESH_TOKEN` του `.env`. */
  private async refreshEnv(refreshToken: string): Promise<string> {
    try {
      const token = await this.grant({ grant_type: 'refresh_token', refresh_token: refreshToken });
      this.remember(token);
      // Αν ο Keycloak περιστρέφει τα refresh tokens, κρατάμε το νέο όσο ζει η
      // διεργασία· η επανεκκίνηση θα ξαναδιαβάσει το παλιό από το .env.
      if (token.refresh_token && token.refresh_token !== this.envToken) {
        this.envToken = token.refresh_token;
        this.logger.warn('Το e-SEO περιέστρεψε το refresh token του .env — σύνδεσε λογαριασμό από τις Ενσωματώσεις.');
      }
      return token.access_token;
    } catch (error) {
      this.cached = undefined;
      this.logger.error(`Αποτυχία αυθεντικοποίησης e-SEO: ${this.describe(error, 'token')}`);
      throw new ServiceUnavailableException(
        'Δεν ήταν δυνατή η αυθεντικοποίηση στο e-SEO — σύνδεσε λογαριασμό από τις Ενσωματώσεις.',
      );
    }
  }
}
