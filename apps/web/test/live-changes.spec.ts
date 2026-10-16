import { describe, expect, it } from 'vitest';
import { CLIENT_ID, randomId } from '../src/lib/client-id';
import { concernsMe, parseChange } from '../src/lib/live-changes';

describe('μηνύματα «άλλαξε αυτό»', () => {
  it('διαβάζονται μόνο όταν έχουν τη σωστή μορφή', () => {
    expect(parseChange(JSON.stringify({ topic: 'schedule', by: 'u-1', origin: 'tab-1' }))).toEqual({ topic: 'schedule', by: 'u-1', origin: 'tab-1' });
    expect(parseChange(JSON.stringify({ topic: 'schedule', by: null, origin: null }))).toEqual({ topic: 'schedule', by: null, origin: null });
    expect(parseChange('όχι json')).toBeNull();
    expect(parseChange(JSON.stringify({ topic: 3 }))).toBeNull();
    expect(parseChange(JSON.stringify(null))).toBeNull();
  });

  it('η καρτέλα που έκανε την αλλαγή δεν ξαναφορτώνει· οι άλλες, για τα θέματά τους', () => {
    const change = { topic: 'schedule', by: 'u-1', origin: 'other-tab' };
    expect(concernsMe(change, ['schedule', 'participants'])).toBe(true);
    expect(concernsMe(change, ['groups'])).toBe(false);
    expect(concernsMe({ ...change, origin: CLIENT_ID }, ['schedule'])).toBe(false);
  });

  it('«*» (η σύνδεση ξανάνοιξε — μπορεί να χάθηκαν μηνύματα): ξαναφορτώνουν όλοι', () => {
    expect(concernsMe({ topic: '*', by: null, origin: null }, ['groups'])).toBe(true);
  });
});

describe('ταυτότητα καρτέλας', () => {
  it('μία ανά καρτέλα, με μορφή που δέχεται ο server', () => {
    expect(CLIENT_ID).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(randomId()).not.toBe(randomId());
  });
});
