import { describe, expect, it } from 'vitest';
import { umamiBeforeSend } from '../src/lib/analytics';

const TOKEN = 'Xq3vA9_kLm2-ZpR8tYw4bN7cF1dG6hJ0sE5uQ';

describe('umamiBeforeSend', () => {
  it('το URL γίνεται «μορφή» διαδρομής: χωρίς query, tokens και ids', () => {
    const out = umamiBeforeSend('event', {
      website: 'w',
      url: `https://app.example.gr/forms/${TOKEN}?lang=el`,
      referrer: '/draseis/3f2b1c9e-1111-4222-8333-444455556666',
      title: 'Έντυπο',
    });
    expect(out).toEqual({ website: 'w', url: 'https://app.example.gr/forms/:token', referrer: '/draseis/:id', title: 'Έντυπο' });
  });

  it('χωρίς URL δεν αλλάζει τίποτα', () => {
    expect(umamiBeforeSend('identify', { website: 'w' })).toEqual({ website: 'w' });
  });
});
