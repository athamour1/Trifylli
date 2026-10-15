import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/vue';
import { ApiError, OfflineError } from '../src/lib/api';
import { prepareEvent } from '../src/lib/error-scrub';

const event = (): ErrorEvent =>
  ({
    request: {
      url: 'https://app.example.gr/forms/Xq3vA9_kLm2-ZpR8tYw4bN7cF1dG6hJ0sE5uQ?x=1#top',
      headers: { 'User-Agent': 'Firefox' },
      query_string: 'x=1',
    },
    user: { id: 'acc-1', email: 'maria@example.gr', ip_address: '10.0.0.7' },
    breadcrumbs: [{ message: 'click' }],
    exception: { values: [{ type: 'Error', value: 'Λάθος για maria@example.gr' }] },
  }) as unknown as ErrorEvent;

describe('prepareEvent', () => {
  it('τα αναμενόμενα δεν είναι σφάλματα: 4xx του API και «εκτός σύνδεσης»', () => {
    expect(prepareEvent(event(), { originalException: new ApiError('Δεν έχετε δικαίωμα', 403) })).toBeNull();
    expect(prepareEvent(event(), { originalException: new OfflineError() })).toBeNull();
  });

  it('ένα 5xx του API φεύγει, με το requestId για να βρεθεί η γραμμή στα logs', () => {
    const out = prepareEvent(event(), { originalException: new ApiError('Σφάλμα', 500, undefined, 'req-42') });
    expect(out?.tags).toMatchObject({ requestId: 'req-42' });
  });

  it('κρατά μόνο ό,τι χρειάζεται: URL χωρίς token/query, id χρήστη, χωρίς breadcrumbs ή emails', () => {
    const out = prepareEvent(event(), { originalException: new Error('boom') });
    expect(out?.request).toEqual({ url: 'https://app.example.gr/forms/:token' });
    expect(out?.user).toEqual({ id: 'acc-1' });
    expect(out?.breadcrumbs).toBeUndefined();
    expect(out?.exception?.values?.[0]?.value).toBe('Λάθος για ***@***');
  });
});
