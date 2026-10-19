import { describe, expect, it } from 'vitest';
import type { Event, Log } from '@sentry/vue';
import { scrubBreadcrumb, scrubLog, scrubTransaction } from '../src/lib/error-reporting-extras';

const TOKEN = 'Xq3vA9_kLm2-ZpR8tYw4bN7cF1dG6hJ0sE5uQ';
const UUID = '3f2b1c9e-1111-4222-8333-444455556666';

describe('extras της PWA', () => {
  it('συναλλαγή: όνομα ως μορφή διαδρομής, fetch spans χωρίς query/tokens, μόνο id χρήστη', () => {
    const out = scrubTransaction({
      type: 'transaction',
      transaction: `/forms/${TOKEN}`,
      request: { url: `https://app.example.gr/forms/${TOKEN}?x=1`, headers: { 'User-Agent': 'Firefox' } },
      user: { id: 'acc-1', email: 'maria@example.gr' },
      spans: [{ description: `GET https://api.example.gr/api/draseis/${UUID}?q=Μαρία`, data: { url: `https://api.example.gr/api/draseis/${UUID}?q=1`, 'http.query': 'q=1' } }],
    } as unknown as Event);
    expect(out.transaction).toBe('/forms/:token');
    expect(out.request).toEqual({ url: 'https://app.example.gr/forms/:token' });
    expect(out.user).toEqual({ id: 'acc-1' });
    expect(out.spans?.[0]?.description).toBe(`GET https://api.example.gr/api/draseis/${UUID}`);
    expect(out.spans?.[0]?.data).toEqual({ url: `https://api.example.gr/api/draseis/${UUID}` });
  });

  it('breadcrumb πλοήγησης: from/to χωρίς tokens', () => {
    const out = scrubBreadcrumb({ category: 'navigation', data: { from: '/draseis', to: `/forms/${TOKEN}?a=1` } });
    expect(out.data).toEqual({ from: '/draseis', to: '/forms/:token' });
  });

  it('log από την κονσόλα: μόνο το κείμενο, κανένα όρισμα', () => {
    const out = scrubLog({
      level: 'error',
      message: 'Αποτυχία για {"name":"Μαρία","email":"maria@example.gr"}',
      attributes: {
        'sentry.origin': 'auto.log.console',
        'sentry.message.template': 'Αποτυχία για {}',
        'sentry.message.parameter.0': { name: 'Μαρία' },
      },
    } as unknown as Log);
    expect(out).toMatchObject({ message: 'Αποτυχία για {}', attributes: { 'sentry.origin': 'auto.log.console' } });
    expect(Object.keys(out.attributes ?? {})).toEqual(['sentry.origin']);
  });
});
