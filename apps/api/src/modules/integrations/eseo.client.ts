import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';
import { AppConfigToken } from '../../common/config/config.module';
import type { AppConfig } from '../../common/config/configuration';
import { EseoAuth } from './eseo.auth';

/**
 * Πελάτης e-SEO (μητρώο μελών Σ.Ε.Ο. στο eseo.seo.gr).
 *
 * Μιλάει στο πραγματικό REST API (`/app/eseo/api`, Spring + Keycloak), όχι σε
 * scraping: endpoints και σχήματα επιβεβαιώθηκαν από το δημόσιο OpenAPI
 * (`/app/eseo/api/v3/api-docs`).
 *
 * Το σχήμα είναι ανεκτικό (`passthrough`): κρατάμε ρητά όσα πεδία χαρτογραφούμε
 * σε κολόνες και φυλάμε όλη την απάντηση ως `Json` στο `User.eseoPayload`, ώστε
 * μια προσθήκη πεδίου από το e-SEO ούτε να σπάει τον συγχρονισμό ούτε να χάνει
 * πληροφορία (κηδεμόνες, διευθύνσεις κ.λπ.).
 */

const unitInfoSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String).nullish(),
    name: z.string().nullish(),
    type: z.string().nullish(),
  })
  .passthrough();

const contactSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String).nullish(),
    fullName: z.string().nullish(),
    phone: z.string().nullish(),
    email: z.string().nullish(),
    type: z.string().nullish(),
  })
  .passthrough();

const memberSchema = z
  .object({
    memberId: z.union([z.string(), z.number()]).transform(String),
    registryNumber: z.string().nullish(),
    type: z.string().nullish(),
    status: z.string().nullish(),
    firstName: z.string().nullish(),
    lastName: z.string().nullish(),
    email: z.string().nullish(),
    birthDate: z.string().nullish(),
    sex: z.string().nullish(),
    cellular: z.string().nullish(),
    landline: z.string().nullish(),
    street: z.string().nullish(),
    postalCode: z.string().nullish(),
    city: z.string().nullish(),
    area: z.string().nullish(),
    contactInfoList: z.array(contactSchema).nullish(),
    unit: unitInfoSchema.nullish(),
    isCensused: z.boolean().nullish(),
    censusValue: z.number().nullish(),
    maxCensusYear: z.number().nullish(),
  })
  .passthrough();

/** Spring `PagedModel`: `{ content, page: { number, totalPages, ... } }`. */
const pagedSchema = z.object({
  content: z.array(memberSchema).default([]),
  page: z
    .object({
      size: z.coerce.number().nullish(),
      number: z.coerce.number().nullish(),
      totalElements: z.coerce.number().nullish(),
      totalPages: z.coerce.number().nullish(),
    })
    .nullish(),
});

export type EseoMember = z.infer<typeof memberSchema>;

/** Κανονικοποιημένη μορφή — ό,τι χρειάζεται ο sync engine. */
export interface NormalizedEseoMember {
  eseoId: string;
  registryNumber?: string;
  /** Το `OrgMemberDTO.type` enum (STAR/BIRD/GUIDE/… ADULT_LEADER/…). */
  type?: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  birthDate?: Date;
  sex?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  area?: string;
  /** Κηδεμόνες (από `contactInfoList`) — μόνο όσοι έχουν id για idempotency. */
  guardians: NormalizedEseoGuardian[];
  /** Raw status enum του e-SEO (REGISTERED/NEW_MEMBER/DELETED/PERM_DELETED). */
  status?: string;
  /** `false` για διαγραμμένα· ο sweep deactivation βασίζεται σε αυτό. */
  active: boolean;
  /** Απογραφή τρέχοντος έτους — προσεγγιστική ένδειξη πληρωμής συνδρομής. */
  isCensused?: boolean;
  censusValue?: number;
  raw: Record<string, unknown>;
}

export interface NormalizedEseoGuardian {
  eseoId: string;
  kind: string;
  fullName?: string;
  phone?: string;
  email?: string;
}

/** Πτυχίο/άδεια στελέχους — κανονικοποιημένο. */
export interface NormalizedEseoLicense {
  eseoId: string;
  memberEseoId?: string;
  title: string;
  status: string;
  startDate?: Date;
  expirationDate?: Date;
  raw: Record<string, unknown>;
}

const pageMetaSchema = z
  .object({
    size: z.coerce.number().nullish(),
    number: z.coerce.number().nullish(),
    totalElements: z.coerce.number().nullish(),
    totalPages: z.coerce.number().nullish(),
  })
  .nullish();

const licenseSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String),
    title: z.object({ title: z.string().nullish() }).passthrough().nullish(),
    member: z
      .object({ memberId: z.union([z.string(), z.number()]).transform(String).nullish() })
      .passthrough()
      .nullish(),
    status: z.string().nullish(),
    startDate: z.string().nullish(),
    expirationDate: z.string().nullish(),
  })
  .passthrough();

const licensePagedSchema = z.object({
  content: z.array(licenseSchema).default([]),
  page: pageMetaSchema,
});

const billingRuleSchema = z.object({
  rule: z.string().nullish(),
  value: z.coerce.number().nullish(),
});
const billingMethodSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform(String).nullish(),
    name: z.string().nullish(),
    rules: z.array(billingRuleSchema).default([]),
  })
  .passthrough();
const billingPagedSchema = z.object({
  content: z.array(billingMethodSchema).default([]),
  page: pageMetaSchema,
});

const PAGE_SIZE = 100;
/** Οι τύποι μέλους που αντιστοιχούν σε ποσό συνδρομής (όχι εκπτωτικοί κανόνες). */
const SUBSCRIPTION_RULE_TYPES = new Set([
  'STAR',
  'BIRD',
  'GUIDE',
  'NAVY_GUIDE',
  'BIG_GUIDE',
  'BIG_NAVY_GUIDE',
  'ADULT_LEADER',
  'LOCAL_COUNCIL_MEMBER',
  'COOP_GROUP_MEMBER',
  'CONFERENCE_MEMBER',
  'FRIEND_OF_GUIDING',
]);

@Injectable()
export class EseoClient {
  private readonly logger = new Logger(EseoClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly auth: EseoAuth,
    @Inject(AppConfigToken) private readonly config: AppConfig,
  ) {}

  get configured(): boolean {
    return this.auth.configured;
  }

  /**
   * Κατεβάζει το μητρώο σελίδα-σελίδα (offset paging του Spring).
   *
   * Το API αυτο-περιορίζεται στη μονάδα του συνδεδεμένου χρήστη· το `unitId`
   * δίνεται ρητά ώστε, αν αύριο το token ανήκει σε επίπεδο Τομέα, ο συγχρονισμός
   * να παραμείνει στο σωστό Τοπικό. Τραβάμε **μόνο ενεργά** μέλη — τα διαγραμμένα
   * τα απενεργοποιεί ο sweep όταν λείπουν από το μητρώο.
   */
  async *members(unitId?: string): AsyncGenerator<NormalizedEseoMember[]> {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Το e-SEO δεν έχει ρυθμιστεί (ESEO_BASE_URL / ESEO_REFRESH_TOKEN).',
      );
    }

    let page = 0;
    let totalPages = Infinity;

    while (page < totalPages) {
      const query: Record<string, string> = {
        page: String(page),
        size: String(PAGE_SIZE),
        active: 'true',
      };
      // Το `unitId` είναι int64 στο e-SEO· ένα μη αριθμητικό (π.χ. placeholder
      // `TRIFYLLI-01`) θα έριχνε 400. Σε αυτή την περίπτωση αφήνουμε το API να
      // περιορίσει μόνο του στη μονάδα του token.
      if (unitId && /^\d+$/.test(unitId)) {
        query.unitId = unitId;
        query.includeSubs = 'true';
      }

      const data = await this.get('/member/', query);
      const parsed = pagedSchema.safeParse(data);
      if (!parsed.success) {
        this.logger.error(`Άκυρη απάντηση e-SEO από /member/: ${parsed.error.message}`);
        throw new ServiceUnavailableException('Το e-SEO επέστρεψε απάντηση σε μη αναμενόμενη μορφή.');
      }

      yield parsed.data.content.map(normalize);

      // Αν το `page.totalPages` λείπει, σταματάμε όταν η σελίδα δεν γεμίσει.
      totalPages =
        parsed.data.page?.totalPages ??
        (parsed.data.content.length < PAGE_SIZE ? page + 1 : page + 2);
      page += 1;
    }
  }

  /**
   * Πτυχία στελεχών, ανά κατάσταση. Τα `PENDING` είναι προτάσεις υπό έγκριση και
   * τα αγνοούμε — κρατάμε όσα ισχύουν ή έληξαν.
   */
  async *licenses(unitId?: string): AsyncGenerator<NormalizedEseoLicense[]> {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Το e-SEO δεν έχει ρυθμιστεί (ESEO_BASE_URL / ESEO_REFRESH_TOKEN).',
      );
    }

    for (const status of ['ACTIVE', 'EXPIRED']) {
      let page = 0;
      let totalPages = Infinity;
      while (page < totalPages) {
        const query: Record<string, string> = {
          page: String(page),
          size: String(PAGE_SIZE),
          status,
        };
        if (unitId && /^\d+$/.test(unitId)) {
          query.unitId = unitId;
          query.includeSubs = 'true';
        }

        const data = await this.get('/license/license', query);
        const parsed = licensePagedSchema.safeParse(data);
        if (!parsed.success) {
          this.logger.error(`Άκυρη απάντηση e-SEO από /license/license: ${parsed.error.message}`);
          throw new ServiceUnavailableException('Το e-SEO επέστρεψε απάντηση σε μη αναμενόμενη μορφή.');
        }

        yield parsed.data.content.map(normalizeLicense);
        totalPages =
          parsed.data.page?.totalPages ??
          (parsed.data.content.length < PAGE_SIZE ? page + 1 : page + 2);
        page += 1;
      }
    }
  }

  /**
   * Ποσό συνδρομής ανά τύπο μέλους, από τη μέθοδο χρέωσης «ΑΠΟΓΡΑΦΗ». Επιστρέφει
   * κενό Map αν δεν βρεθεί — τότε ο sync πέφτει πίσω στο ποσό της περιόδου.
   */
  async billingAmounts(): Promise<Map<string, number>> {
    const amounts = new Map<string, number>();
    if (!this.configured) return amounts;

    try {
      const data = await this.get('/billmethod/', { page: '0', size: '20', status: 'ACTIVE' });
      const parsed = billingPagedSchema.safeParse(data);
      if (!parsed.success) return amounts;

      const methods = parsed.data.content;
      // Προτίμησε τη βασική «ΑΠΟΓΡΑΦΗ» (χωρίς έκπτωση)· αλλιώς η πρώτη.
      const method =
        methods.find((m) => m.name?.trim().toUpperCase() === 'ΑΠΟΓΡΑΦΗ') ??
        methods.find((m) => m.id === '1') ??
        methods[0];
      if (!method) return amounts;

      for (const rule of method.rules) {
        if (rule.rule && rule.value != null && SUBSCRIPTION_RULE_TYPES.has(rule.rule.toUpperCase())) {
          amounts.set(rule.rule.toUpperCase(), rule.value);
        }
      }
    } catch {
      // Η χρέωση είναι βελτίωση, όχι προϋπόθεση — σε αποτυχία γυρίζουμε κενό Map.
    }
    return amounts;
  }

  private async get(path: string, query: Record<string, string>): Promise<unknown> {
    const base = this.config.ESEO_BASE_URL!.replace(/\/$/, '');
    const qs = new URLSearchParams(query).toString();
    const url = `${base}/api${path}${qs ? `?${qs}` : ''}`;
    const token = await this.auth.accessToken();

    try {
      const response = await firstValueFrom(
        this.http.get<unknown>(url, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          timeout: 30_000,
        }),
      );
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Αποτυχία κλήσης e-SEO ${path}: ${message}`);
      throw new ServiceUnavailableException('Δεν ήταν δυνατή η επικοινωνία με το e-SEO.');
    }
  }
}

/** Το e-SEO βάζει `missing@email.com` ή σκέτο `0` εκεί που δεν έχει στοιχείο. */
function cleanEmail(value: string | null | undefined): string | undefined {
  const v = value?.trim();
  if (!v || v.toLowerCase() === 'missing@email.com' || !v.includes('@')) return undefined;
  return v;
}

function cleanPhone(value: string | null | undefined): string | undefined {
  const v = value?.trim();
  if (!v || v === '0') return undefined;
  return v;
}

function toDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function normalize(member: EseoMember): NormalizedEseoMember {
  const status = member.status?.trim().toUpperCase();

  const guardians: NormalizedEseoGuardian[] = (member.contactInfoList ?? [])
    .filter((c): c is typeof c & { id: string } => Boolean(c.id))
    .map((c) => ({
      eseoId: c.id,
      kind: (c.type ?? 'GUARDIAN').trim().toUpperCase(),
      fullName: c.fullName?.trim() || undefined,
      phone: cleanPhone(c.phone),
      email: cleanEmail(c.email),
    }));

  return {
    eseoId: member.memberId,
    registryNumber: member.registryNumber ?? undefined,
    type: member.type ?? undefined,
    firstName: (member.firstName ?? '').trim(),
    lastName: (member.lastName ?? '').trim(),
    email: cleanEmail(member.email),
    phone: cleanPhone(member.cellular) ?? cleanPhone(member.landline),
    birthDate: toDate(member.birthDate),
    sex: member.sex?.trim().toUpperCase() || undefined,
    street: member.street?.trim() || undefined,
    postalCode: member.postalCode?.trim() || undefined,
    city: member.city?.trim() || undefined,
    area: member.area?.trim() || undefined,
    guardians,
    status,
    active: status ? !['DELETED', 'PERM_DELETED'].includes(status) : true,
    isCensused: member.isCensused ?? undefined,
    censusValue: member.censusValue ?? undefined,
    raw: member as Record<string, unknown>,
  };
}

function normalizeLicense(license: z.infer<typeof licenseSchema>): NormalizedEseoLicense {
  return {
    eseoId: license.id,
    memberEseoId: license.member?.memberId ?? undefined,
    title: license.title?.title?.trim() || '—',
    status: (license.status ?? 'ACTIVE').trim().toUpperCase(),
    startDate: toDate(license.startDate),
    expirationDate: toDate(license.expirationDate),
    raw: license as Record<string, unknown>,
  };
}
