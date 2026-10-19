import { describe, expect, it, vi } from 'vitest';
import type { Event, Log } from '@sentry/node';

vi.mock('@sentry/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sentry/node')>();
  return { ...actual, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } };
});

import * as Sentry from '@sentry/node';
import { scrubText, urlTemplate } from '@trifylli/shared';
import { scrubCspReport } from './csp-report.controller';
import { forwardLog, scrubBreadcrumb, scrubLog, scrubTransaction } from './error-reporting-extras';

const TOKEN = 'Xq3vA9_kLm2-ZpR8tYw4bN7cF1dG6hJ0sE5uQ';
const UUID = '3f2b1c9e-1111-4222-8333-444455556666';

describe('urlTemplate / scrubText', () => {
  it('η «μορφή» της διαδρομής: UUID και αριθμοί → :id, tokens → :token, χωρίς query', () => {
    expect(urlTemplate(`GET /api/draseis/${UUID}/forms/${TOKEN}?x=1`)).toBe('GET /api/draseis/:id/forms/:token');
    expect(urlTemplate('https://api.example.gr/api/meloi/42')).toBe('https://api.example.gr/api/meloi/:id');
  });

  it('ελεύθερο κείμενο: emails και URL μέσα του καθαρίζουν', () => {
    expect(scrubText(`GET https://api.example.gr/api/forms/${TOKEN}?lang=el από maria@example.gr`)).toBe(
      'GET https://api.example.gr/api/forms/:token από ***@***',
    );
  });
});

describe('extras: συναλλαγές, breadcrumbs, logs', () => {
  it('συναλλαγή: όνομα ως μορφή διαδρομής, spans χωρίς query/tokens, χωρίς headers και email χρήστη', () => {
    const event = {
      type: 'transaction',
      transaction: `GET /api/draseis/${UUID}`,
      request: { method: 'GET', url: `https://api.example.gr/api/draseis/${UUID}?q=Μαρία`, headers: { a: 'b' } },
      user: { id: 'acc-1', email: 'maria@example.gr' },
      spans: [
        {
          description: `GET https://eseo.seo.gr/api/members/${TOKEN}?email=maria@example.gr`,
          data: {
            'url.full': `https://eseo.seo.gr/api/members/${TOKEN}?x=1`,
            'url.query': 'x=1',
            'db.system': 'postgresql',
          },
        },
      ],
    } as unknown as Event;

    const out = scrubTransaction(event);

    expect(out.transaction).toBe('GET /api/draseis/:id');
    expect(out.request).toEqual({ method: 'GET', url: `https://api.example.gr/api/draseis/${UUID}` });
    expect(out.user).toEqual({ id: 'acc-1' });
    expect(out.spans?.[0]?.description).toBe('GET https://eseo.seo.gr/api/members/:token');
    expect(out.spans?.[0]?.data).toEqual({
      'url.full': 'https://eseo.seo.gr/api/members/:token',
      'db.system': 'postgresql',
    });
  });

  it('breadcrumb: URL και μήνυμα καθαρά', () => {
    const out = scrubBreadcrumb({
      category: 'http',
      message: 'σφάλμα για maria@example.gr',
      data: { url: `https://api.example.gr/forms/${TOKEN}?a=1`, 'http.query': 'a=1', status_code: 500 },
    });
    expect(out.message).toBe('σφάλμα για ***@***');
    expect(out.data).toEqual({ url: 'https://api.example.gr/forms/:token', status_code: 500 });
  });

  it('log: μήνυμα και attributes καθαρά', () => {
    const out = scrubLog({
      level: 'info',
      message: 'πρόσκληση στο maria@example.gr',
      attributes: { path: `/forms/${TOKEN}` },
    } as Log);
    expect(out.message).toBe('πρόσκληση στο ***@***');
    expect(out.attributes).toEqual({ path: '/forms/:token' });
  });

  it('γραμμή του Nest logger → log του GlitchTip, τα αντικείμενα ως attributes', () => {
    forwardLog({
      level: 'log',
      message: { method: 'GET', path: '/api/meloi', status: 200, ms: 12 },
      context: 'HTTP',
      requestId: 'r1',
    });
    expect(Sentry.logger.info).toHaveBeenCalledWith(expect.stringContaining('"path":"/api/meloi"'), {
      context: 'HTTP',
      requestId: 'r1',
      method: 'GET',
      path: '/api/meloi',
      status: 200,
      ms: 12,
    });
    forwardLog({ level: 'error', message: 'έσκασε', context: 'Jobs' });
    expect(Sentry.logger.error).toHaveBeenCalledWith('έσκασε', { context: 'Jobs' });
  });
});

describe('scrubCspReport', () => {
  it('μόνο γνωστά πεδία, URL χωρίς token/query, ποτέ script-sample', () => {
    const out = scrubCspReport({
      'csp-report': {
        'document-uri': `https://app.example.gr/forms/${TOKEN}?lang=el`,
        'blocked-uri': 'https://evil.example/x.js?k=1',
        'violated-directive': 'script-src-elem',
        'effective-directive': 'script-src-elem',
        'original-policy': "default-src 'self'",
        'script-sample': 'Μαρία Παπαδοπούλου — αλλεργία',
        'line-number': 12,
        extra: 'x',
      },
    });
    expect(out).toEqual({
      'document-uri': 'https://app.example.gr/forms/:token',
      'blocked-uri': 'https://evil.example/x.js',
      'violated-directive': 'script-src-elem',
      'effective-directive': 'script-src-elem',
      'original-policy': "default-src 'self'",
      'line-number': 12,
      // Τα απαιτεί το GlitchTip — προεπιλογές όταν λείπουν.
      disposition: 'enforce',
      'status-code': 0,
    });
  });

  it('ό,τι δεν μοιάζει με αναφορά CSP απορρίπτεται', () => {
    expect(scrubCspReport({ hello: 'world' })).toBeNull();
    expect(scrubCspReport({ 'csp-report': { 'document-uri': 'https://x' } })).toBeNull();
    expect(scrubCspReport(null)).toBeNull();
  });
});
