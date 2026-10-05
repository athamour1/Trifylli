import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';
import { AppConfigToken } from '../../common/config/config.module';
import type { AppConfig } from '../../common/config/configuration';

/**
 * Πελάτης του **admin API** του Authentik — μόνο για πρόσκληση και επαναφορά κωδικού.
 *
 * Το Authentik παραμένει η πηγή ταυτότητας: εδώ δεν ορίζουμε ποτέ κωδικό, ούτε
 * προσωρινό. Ζητάμε από το Authentik να στείλει **σύνδεσμο ορισμού κωδικού**
 * στο email του ατόμου (ροή `trifylli-recovery`), οπότε ο κωδικός γεννιέται και
 * πεθαίνει εκεί — ποτέ δεν περνά από το Trifylli, από chat ή από προφορική
 * μεταφορά σε συγκέντρωση.
 *
 * Ο ίδιος σύνδεσμος εξυπηρετεί και τις δύο περιπτώσεις: «νέος λογαριασμός» και
 * «ξέχασα τον κωδικό». Διαφέρει μόνο ποιος τον ζητά.
 *
 * Προϋποθέσεις: `AUTHENTIK_API_URL` + `AUTHENTIK_API_TOKEN` (token λογαριασμού
 * με δικαίωμα διαχείρισης χρηστών) και εφαρμοσμένο το blueprint
 * `infra/authentik/trifylli-recovery.yaml`. Χωρίς αυτά ο client είναι
 * «μη ρυθμισμένος» και το λέει καθαρά αντί να αποτύχει σιωπηλά.
 */

const userSchema = z
  .object({
    pk: z.coerce.number(),
    username: z.string(),
    email: z.string().nullish(),
    is_active: z.boolean().nullish(),
  })
  .passthrough();

const userListSchema = z.object({ results: z.array(userSchema).default([]) }).passthrough();

const stageListSchema = z
  .object({
    results: z.array(z.object({ pk: z.string(), name: z.string() }).passthrough()).default([]),
  })
  .passthrough();

export interface AuthentikInvitee {
  email: string;
  firstName: string;
  lastName: string;
}

@Injectable()
export class AuthentikClient {
  private readonly logger = new Logger(AuthentikClient.name);
  /** Το pk του email stage αλλάζει μόνο αν ξαναστηθεί το Authentik — αξίζει cache. */
  private emailStagePk: string | null = null;

  constructor(
    private readonly http: HttpService,
    @Inject(AppConfigToken) private readonly config: AppConfig,
  ) {}

  get configured(): boolean {
    return Boolean(this.config.AUTHENTIK_API_URL && this.config.AUTHENTIK_API_TOKEN);
  }

  /**
   * Στέλνει σύνδεσμο ορισμού κωδικού. Αν το άτομο δεν υπάρχει στο Authentik,
   * δημιουργείται πρώτα — ο υπερδιαχειριστής δεν χρειάζεται να ανοίξει δεύτερο
   * εργαλείο για να δώσει πρόσβαση.
   *
   * Ο νέος χρήστης γεννιέται **χωρίς κωδικό**: μέχρι να ανοίξει τον σύνδεσμο
   * καμία σύνδεση δεν περνά. Παραμένει ενεργός ώστε το «ξέχασα τον κωδικό» να
   * δουλεύει κι αν χαθεί το πρώτο email.
   */
  async sendPasswordSetupEmail(invitee: AuthentikInvitee): Promise<void> {
    const email = invitee.email.trim().toLowerCase();
    const existing = await this.findByEmail(email);
    const pk = existing?.pk ?? (await this.createUser(invitee, email));

    await this.post(`/api/v3/core/users/${pk}/recovery_email/`, {
      email_stage: await this.resolveEmailStage(),
    });

    this.logger.log(`Στάλθηκε σύνδεσμος ορισμού κωδικού στο ${email}.`);
  }

  private async findByEmail(email: string) {
    const data = await this.get('/api/v3/core/users/', userListSchema, { email });
    return data.results[0] ?? null;
  }

  private async createUser(invitee: AuthentikInvitee, email: string): Promise<number> {
    const name = `${invitee.firstName} ${invitee.lastName}`.trim();
    // Username = email: είναι ήδη μοναδικό (μόλις ψάξαμε με αυτό) και κρατά την
    // αντιστοίχιση με τον λογαριασμό της εφαρμογής προφανή σε όποιον κοιτάξει
    // το Authentik — ένα `papadopoulou2` δεν λέει τίποτα σε κανέναν.
    const created = await this.post(
      '/api/v3/core/users/',
      { username: email, name: name || email, email, is_active: true, path: 'users', type: 'internal' },
      userSchema,
    );
    this.logger.log(`Δημιουργήθηκε χρήστης Authentik για το ${email}.`);
    return created.pk;
  }

  /** Το email stage της ροής μας — χωρίς αυτό το Authentik δεν ξέρει τι να στείλει. */
  private async resolveEmailStage(): Promise<string> {
    if (this.emailStagePk) return this.emailStagePk;

    const wanted = this.config.AUTHENTIK_RECOVERY_EMAIL_STAGE;
    const data = await this.get('/api/v3/stages/email/', stageListSchema);
    const stage = data.results.find((s) => s.name === wanted);

    if (!stage) {
      throw new ServiceUnavailableException(
        `Δεν βρέθηκε το email stage «${wanted}» στο Authentik — εφαρμόστε το blueprint trifylli-recovery.yaml.`,
      );
    }

    this.emailStagePk = stage.pk;
    return stage.pk;
  }

  // ─────────────────────────── HTTP ───────────────────────────

  private assertConfigured(): void {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Δεν έχει ρυθμιστεί η σύνδεση με το Authentik (AUTHENTIK_API_URL / AUTHENTIK_API_TOKEN).',
      );
    }
  }

  private url(path: string): string {
    return `${this.config.AUTHENTIK_API_URL!.replace(/\/$/, '')}${path}`;
  }

  private get headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.config.AUTHENTIK_API_TOKEN}` };
  }

  private async get<S extends z.ZodTypeAny>(
    path: string,
    schema: S,
    params?: Record<string, string>,
  ): Promise<z.infer<S>> {
    this.assertConfigured();
    try {
      const response = await firstValueFrom(
        this.http.get<unknown>(this.url(path), { headers: this.headers, params, timeout: 15_000 }),
      );
      return schema.parse(response.data);
    } catch (error) {
      throw this.fail(`GET ${path}`, error);
    }
  }

  private async post<S extends z.ZodTypeAny>(
    path: string,
    body: unknown,
    schema?: S,
  ): Promise<z.infer<S>> {
    this.assertConfigured();
    try {
      const response = await firstValueFrom(
        this.http.post<unknown>(this.url(path), body, { headers: this.headers, timeout: 15_000 }),
      );
      // Το `recovery_email` απαντά 204 χωρίς σώμα — δεν υπάρχει τι να ελεγχθεί.
      return schema ? schema.parse(response.data) : (undefined as never);
    } catch (error) {
      throw this.fail(`POST ${path}`, error);
    }
  }

  /**
   * Τα σφάλματα του Authentik έρχονται ως `{"field": ["μήνυμα"]}`. Τα ξετυλίγουμε
   * γιατί αλλιώς ο υπερδιαχειριστής βλέπει «Request failed with status code 400»
   * και δεν έχει τρόπο να μαντέψει ότι, π.χ., το username υπάρχει ήδη.
   */
  private fail(what: string, error: unknown): ServiceUnavailableException {
    if (error instanceof ServiceUnavailableException) return error;

    const response = (error as { response?: { status?: number; data?: unknown } }).response;
    const detail = response?.data ? JSON.stringify(response.data).slice(0, 300) : undefined;
    const message = detail ?? (error instanceof Error ? error.message : String(error));

    this.logger.error(`Authentik ${what}: ${message}`);
    return new ServiceUnavailableException(`Αποτυχία επικοινωνίας με το Authentik: ${message}`);
  }
}
