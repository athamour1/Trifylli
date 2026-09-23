import { randomBytes } from 'node:crypto';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';
import { AppConfigToken } from '../../common/config/config.module';
import type { AppConfig } from '../../common/config/configuration';

/**
 * Πελάτης Ouchtracker (διαχείριση φαρμακείων — https://github.com/athamour1/ouchtracker).
 *
 * Το Ouchtracker **δεν** έχει static API key: αυθεντικοποιεί με JWT μέσω
 * `POST /api/auth/login` (email + password, ρόλος ADMIN). Κρατάμε το access
 * token και κάνουμε αυτόματα ξανά login στο 401.
 *
 * Το μοντέλο του διαφέρει από αυτό που περιμέναμε αρχικά: δεν υπάρχει flat
 * `inventory`, αλλά **Kits** με **KitItems**, και τα «περιστατικά» είναι
 * `IncidentReport` (είδη που καταναλώθηκαν). Ο client κανονικοποιεί και τα δύο
 * σε σχήμα που ταιριάζει στο τοπικό φαρμακείο.
 */

const kitItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    category: z.string().nullish(),
    unit: z.string().nullish(),
    quantity: z.coerce.number().int().nonnegative().default(0),
    locationInKit: z.string().nullish(),
    expirationDate: z.string().nullish(),
    notes: z.string().nullish(),
  })
  .passthrough();

const kitSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    location: z.string().nullish(),
    kitItems: z.array(kitItemSchema).default([]),
  })
  .passthrough();

const incidentItemSchema = z
  .object({
    quantityUsed: z.coerce.number().int().nonnegative().default(0),
    notes: z.string().nullish(),
    kitItem: z.object({ name: z.string().nullish(), unit: z.string().nullish() }).passthrough().nullish(),
  })
  .passthrough();

const incidentSchema = z
  .object({
    id: z.string(),
    description: z.string().nullish(),
    createdAt: z.string(),
    kit: z.object({ name: z.string().nullish() }).passthrough().nullish(),
    items: z.array(incidentItemSchema).default([]),
  })
  .passthrough();

const loginSchema = z.object({ accessToken: z.string() }).passthrough();

const ouchUserSchema = z.object({ id: z.string(), email: z.string() }).passthrough();

const kitDetailSchema = z
  .object({
    id: z.string(),
    name: z.string().nullish(),
    assignees: z.array(z.object({ id: z.string() }).passthrough()).default([]),
  })
  .passthrough();

/** Κανονικοποιημένο είδος φαρμακείου (ένα KitItem μέσα σε ένα Kit). */
export interface OuchtrackerInventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: string | null;
  expirationDate: string | null;
  locationInKit: string | null;
  kitId: string;
  kitName: string;
}

/** Κανονικοποιημένο περιστατικό (IncidentReport). */
export interface OuchtrackerIncident {
  id: string;
  createdAt: string;
  description: string | null;
  kitName: string | null;
  items: { name: string; quantityUsed: number; unit: string | null }[];
}

@Injectable()
export class OuchtrackerClient {
  private readonly logger = new Logger(OuchtrackerClient.name);
  private token: string | null = null;
  private tokenFetchedAt = 0;
  /** Το access token ζει 8ω· ανανεώνουμε με περιθώριο. */
  private readonly tokenTtlMs = 7 * 60 * 60 * 1000;

  constructor(
    private readonly http: HttpService,
    @Inject(AppConfigToken) private readonly config: AppConfig,
  ) {}

  /** `false` όταν δεν έχει ρυθμιστεί — τα endpoints φαρμακείου απαντούν 503. */
  get configured(): boolean {
    return Boolean(
      this.config.OUCHTRACKER_BASE_URL &&
        this.config.OUCHTRACKER_EMAIL &&
        this.config.OUCHTRACKER_PASSWORD,
    );
  }

  async inventory(): Promise<OuchtrackerInventoryItem[]> {
    const kits = await this.get('/api/kits', z.array(kitSchema));
    return kits.flatMap((kit) =>
      kit.kitItems.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit ?? null,
        category: item.category ?? null,
        expirationDate: item.expirationDate ?? null,
        locationInKit: item.locationInKit ?? null,
        kitId: kit.id,
        kitName: kit.name,
      })),
    );
  }

  async incidents(): Promise<OuchtrackerIncident[]> {
    const reports = await this.get('/api/incidents', z.array(incidentSchema));
    return reports.map((report) => ({
      id: report.id,
      createdAt: report.createdAt,
      description: report.description ?? null,
      kitName: report.kit?.name ?? null,
      items: report.items.map((it) => ({
        name: it.kitItem?.name ?? 'Είδος',
        quantityUsed: it.quantityUsed,
        unit: it.kitItem?.unit ?? null,
      })),
    }));
  }

  // ───────────────────── Kits & assignees (δανεισμός) ─────────────────────

  /** Όλα τα Kits με βασικά στοιχεία — για να διαλέξει κανείς ποιο «φαρμακείο». */
  async kits(): Promise<{ id: string; name: string; location: string | null }[]> {
    const kits = await this.get('/api/kits', z.array(kitSchema));
    return kits.map((k) => ({ id: k.id, name: k.name, location: k.location ?? null }));
  }

  /** Οι χρήστες του OuchTracker — για αντιστοίχιση με μέλη κλάδου μέσω email. */
  async listUsers(): Promise<{ id: string; email: string }[]> {
    const users = await this.get('/api/users', z.array(ouchUserSchema));
    return users.map((u) => ({ id: u.id, email: u.email.toLowerCase() }));
  }

  /** Οι τρέχοντες assignees ενός Kit — στιγμιότυπο πριν τον δανεισμό. */
  async getKitAssigneeIds(kitId: string): Promise<string[]> {
    const kit = await this.get(`/api/kits/${kitId}`, kitDetailSchema);
    return (kit.assignees ?? []).map((a) => a.id);
  }

  /** Ανάθεση του Kit σε συγκεκριμένους χρήστες (αντικαθιστά τους προηγούμενους). */
  async assignKit(kitId: string, userIds: string[]): Promise<void> {
    await this.patch(`/api/kits/${kitId}/assign`, { userIds }, kitDetailSchema);
  }

  /**
   * Δημιουργεί λογαριασμό CHECKER (αν δεν υπάρχει ήδη), ώστε να μπορεί να του
   * ανατεθεί ένα Kit **πριν** συνδεθεί για πρώτη φορά με SSO. Όταν συνδεθεί,
   * το `oidcLogin` του OuchTracker βρίσκει τον λογαριασμό με το email και τον
   * χρησιμοποιεί. Ο κωδικός είναι τυχαίος — η είσοδος γίνεται μόνο με SSO.
   */
  async createUser(email: string, fullName: string): Promise<string> {
    const password = randomBytes(24).toString('base64url');
    const created = await this.post(
      '/api/users',
      { email, fullName: fullName || email, password, role: 'CHECKER' },
      ouchUserSchema,
    );
    return created.id;
  }

  // ─────────────────────────── HTTP + auth ───────────────────────────

  private baseUrl(): string {
    return this.config.OUCHTRACKER_BASE_URL!.replace(/\/$/, '');
  }

  private async login(): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.http.post<unknown>(
          `${this.baseUrl()}/api/auth/login`,
          { email: this.config.OUCHTRACKER_EMAIL, password: this.config.OUCHTRACKER_PASSWORD },
          { timeout: 15_000 },
        ),
      );
      const parsed = loginSchema.safeParse(response.data);
      if (!parsed.success) throw new Error('απάντηση login χωρίς accessToken');
      this.token = parsed.data.accessToken;
      this.tokenFetchedAt = Date.now();
      return this.token;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Αποτυχία σύνδεσης στο Ouchtracker: ${message}`);
      throw new ServiceUnavailableException('Αποτυχία σύνδεσης στο Ouchtracker — ελέγξτε email/κωδικό.');
    }
  }

  private async token_(): Promise<string> {
    if (this.token && Date.now() - this.tokenFetchedAt < this.tokenTtlMs) return this.token;
    return this.login();
  }

  private async get<S extends z.ZodTypeAny>(path: string, schema: S): Promise<z.infer<S>> {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Το Ouchtracker δεν έχει ρυθμιστεί (OUCHTRACKER_BASE_URL / OUCHTRACKER_EMAIL / OUCHTRACKER_PASSWORD).',
      );
    }

    const url = `${this.baseUrl()}${path}`;
    let token = await this.token_();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await firstValueFrom(
          this.http.get<unknown>(url, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 15_000,
          }),
        );
        const parsed = schema.safeParse(response.data);
        if (!parsed.success) {
          this.logger.error(`Άκυρη απάντηση Ouchtracker από ${path}: ${parsed.error.message}`);
          throw new ServiceUnavailableException('Το Ouchtracker επέστρεψε απάντηση σε μη αναμενόμενη μορφή.');
        }
        return parsed.data;
      } catch (error) {
        if (error instanceof ServiceUnavailableException) throw error;
        // Ληγμένο token → ένα retry με φρέσκο login.
        const status = (error as { response?: { status?: number } }).response?.status;
        if (status === 401 && attempt === 0) {
          token = await this.login();
          continue;
        }
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Αποτυχία κλήσης Ouchtracker ${path}: ${message}`);
        throw new ServiceUnavailableException('Δεν ήταν δυνατή η επικοινωνία με το Ouchtracker.');
      }
    }
    throw new ServiceUnavailableException('Δεν ήταν δυνατή η επικοινωνία με το Ouchtracker.');
  }

  private async patch<S extends z.ZodTypeAny>(
    path: string,
    body: unknown,
    schema: S,
  ): Promise<z.infer<S>> {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Το Ouchtracker δεν έχει ρυθμιστεί (OUCHTRACKER_BASE_URL / OUCHTRACKER_EMAIL / OUCHTRACKER_PASSWORD).',
      );
    }

    const url = `${this.baseUrl()}${path}`;
    let token = await this.token_();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await firstValueFrom(
          this.http.patch<unknown>(url, body, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 15_000,
          }),
        );
        const parsed = schema.safeParse(response.data);
        if (!parsed.success) {
          this.logger.error(`Άκυρη απάντηση Ouchtracker από ${path}: ${parsed.error.message}`);
          throw new ServiceUnavailableException('Το Ouchtracker επέστρεψε απάντηση σε μη αναμενόμενη μορφή.');
        }
        return parsed.data;
      } catch (error) {
        if (error instanceof ServiceUnavailableException) throw error;
        const status = (error as { response?: { status?: number } }).response?.status;
        if (status === 401 && attempt === 0) {
          token = await this.login();
          continue;
        }
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Αποτυχία κλήσης Ouchtracker ${path}: ${message}`);
        throw new ServiceUnavailableException('Δεν ήταν δυνατή η επικοινωνία με το Ouchtracker.');
      }
    }
    throw new ServiceUnavailableException('Δεν ήταν δυνατή η επικοινωνία με το Ouchtracker.');
  }

  private async post<S extends z.ZodTypeAny>(
    path: string,
    body: unknown,
    schema: S,
  ): Promise<z.infer<S>> {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Το Ouchtracker δεν έχει ρυθμιστεί (OUCHTRACKER_BASE_URL / OUCHTRACKER_EMAIL / OUCHTRACKER_PASSWORD).',
      );
    }

    const url = `${this.baseUrl()}${path}`;
    let token = await this.token_();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await firstValueFrom(
          this.http.post<unknown>(url, body, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 15_000,
          }),
        );
        const parsed = schema.safeParse(response.data);
        if (!parsed.success) {
          this.logger.error(`Άκυρη απάντηση Ouchtracker από ${path}: ${parsed.error.message}`);
          throw new ServiceUnavailableException('Το Ouchtracker επέστρεψε απάντηση σε μη αναμενόμενη μορφή.');
        }
        return parsed.data;
      } catch (error) {
        if (error instanceof ServiceUnavailableException) throw error;
        const status = (error as { response?: { status?: number } }).response?.status;
        if (status === 401 && attempt === 0) {
          token = await this.login();
          continue;
        }
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Αποτυχία κλήσης Ouchtracker ${path}: ${message}`);
        throw new ServiceUnavailableException('Δεν ήταν δυνατή η επικοινωνία με το Ouchtracker.');
      }
    }
    throw new ServiceUnavailableException('Δεν ήταν δυνατή η επικοινωνία με το Ouchtracker.');
  }
}
