import { Body, Controller, Headers, HttpCode, Inject, Logger, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { scrubText, scrubUrlPath } from '@trifylli/shared';
import { Public } from '../auth/decorators';
import { AppConfigToken } from '../config/config.module';
import type { AppConfig } from '../config/configuration';

/** Τα πεδία μιας αναφοράς `report-uri` που κρατάμε· τα URL περνούν από το `scrubUrlPath`. */
const URL_FIELDS = ['document-uri', 'referrer', 'blocked-uri', 'source-file'] as const;
const TEXT_FIELDS = ['violated-directive', 'effective-directive', 'original-policy', 'disposition'] as const;
const NUMBER_FIELDS = ['status-code', 'line-number', 'column-number'] as const;

/**
 * Μια αναφορά παραβίασης CSP όπως επιτρέπεται να φύγει: μόνο τα γνωστά πεδία,
 * URL χωρίς query και tokens. Το `script-sample` (κομμάτι του κώδικα ή του
 * περιεχομένου που μπλοκαρίστηκε) δεν φεύγει ποτέ. `null` αν δεν μοιάζει με αναφορά.
 */
export function scrubCspReport(body: unknown): Record<string, string | number> | null {
  const report = (body as { 'csp-report'?: unknown } | null)?.['csp-report'];
  if (!report || typeof report !== 'object') return null;
  const source = report as Record<string, unknown>;
  const out: Record<string, string | number> = {};
  for (const key of URL_FIELDS) {
    const value = source[key];
    if (typeof value === 'string') out[key] = scrubUrlPath(value);
  }
  for (const key of TEXT_FIELDS) {
    const value = source[key];
    if (typeof value === 'string') out[key] = scrubText(value);
  }
  for (const key of NUMBER_FIELDS) {
    const value = source[key];
    if (typeof value === 'number') out[key] = value;
  }
  if (!out['violated-directive'] && !out['effective-directive']) return null;
  // Το GlitchTip τα απαιτεί· παλιότεροι browsers δεν τα στέλνουν πάντα.
  out['disposition'] ??= 'enforce';
  out['status-code'] ??= 0;
  return out;
}

/**
 * Οι παραβιάσεις CSP της PWA. Ο browser τις στέλνει εδώ (`report-uri`) και όχι
 * κατευθείαν στο GlitchTip, γιατί το `document-uri` είναι η πλήρης διεύθυνση
 * της σελίδας — σε δημόσιο σύνδεσμο εντύπου, με το token του. Εδώ καθαρίζεται
 * και προωθείται στο «Security Endpoint» του project (`CSP_REPORT_FORWARD_URL`).
 */
@ApiExcludeController()
@Controller('csp-report')
export class CspReportController {
  private readonly logger = new Logger(CspReportController.name);

  constructor(@Inject(AppConfigToken) private readonly config: AppConfig) {}

  @Post()
  @Public()
  @HttpCode(204)
  // Ένας σπασμένος κανόνας σε μια σελίδα βγάζει μια αναφορά ανά φόρτωμα — αρκεί.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async report(@Body() body: unknown, @Headers('user-agent') userAgent: string | undefined): Promise<void> {
    const target = this.config.CSP_REPORT_FORWARD_URL;
    if (!target) return;
    const report = scrubCspReport(body);
    if (!report) return;
    try {
      const response = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/csp-report', ...(userAgent ? { 'User-Agent': userAgent } : {}) },
        body: JSON.stringify({ 'csp-report': report }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) this.logger.warn(`Αναφορά CSP: το GlitchTip απάντησε ${response.status}`);
    } catch (error) {
      this.logger.warn(`Αναφορά CSP: αποτυχία προώθησης — ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
