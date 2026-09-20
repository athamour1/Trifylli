import { describe, expect, it } from 'vitest';
import { mergeParousies } from './merge';

const t = (iso: string) => new Date(`2026-05-12T${iso}:00Z`);

describe('mergeParousies', () => {
  it('γράφει ό,τι δεν υπάρχει', () => {
    const result = mergeParousies([], [{ userId: 'a', status: 'PAROUSIA', recordedAt: t('18:00') }]);
    expect(result.toWrite).toHaveLength(1);
    expect(result.stale).toHaveLength(0);
  });

  it('η πιο πρόσφατη καταγραφή στη συσκευή κερδίζει', () => {
    const existing = [{ userId: 'a', status: 'APOUSIA', note: null, recordedAt: t('18:00') }];
    const result = mergeParousies(existing, [{ userId: 'a', status: 'PAROUSIA', recordedAt: t('18:30') }]);
    expect(result.toWrite[0]?.status).toBe('PAROUSIA');
  });

  it('μια καθυστερημένη offline εγγραφή δεν σβήνει νεότερη διόρθωση', () => {
    // Το κινητό κατέγραψε 18:00 και συγχρονίστηκε στις 21:00· στο μεταξύ
    // κάποιος διόρθωσε online στις 19:00. Η διόρθωση πρέπει να κρατήσει.
    const existing = [{ userId: 'a', status: 'DIKAIOLOGIMENI', note: null, recordedAt: t('19:00') }];
    const result = mergeParousies(existing, [{ userId: 'a', status: 'APOUSIA', recordedAt: t('18:00') }]);
    expect(result.toWrite).toHaveLength(0);
    expect(result.stale).toEqual([{ userId: 'a', keptRecordedAt: t('19:00') }]);
  });

  it('η επανάληψη του ίδιου αιτήματος δεν αλλάζει τίποτα', () => {
    const existing = [{ userId: 'a', status: 'PAROUSIA', note: null, recordedAt: t('18:00') }];
    const result = mergeParousies(existing, [{ userId: 'a', status: 'PAROUSIA', recordedAt: t('18:00') }]);
    expect(result.toWrite).toHaveLength(0);
    expect(result.stale).toHaveLength(1);
  });

  it('συμπτύσσει διπλότυπα του ίδιου payload στο νεότερο', () => {
    const result = mergeParousies(
      [],
      [
        { userId: 'a', status: 'APOUSIA', recordedAt: t('18:00') },
        { userId: 'a', status: 'PAROUSIA', recordedAt: t('18:45') },
        { userId: 'a', status: 'ARGOPORIA', recordedAt: t('18:20') },
      ],
    );
    expect(result.toWrite).toHaveLength(1);
    expect(result.toWrite[0]?.status).toBe('PAROUSIA');
  });

  it('χειρίζεται πολλά μέλη ανεξάρτητα', () => {
    const existing = [
      { userId: 'a', status: 'PAROUSIA', note: null, recordedAt: t('19:00') },
      { userId: 'b', status: 'APOUSIA', note: null, recordedAt: t('17:00') },
    ];
    const result = mergeParousies(existing, [
      { userId: 'a', status: 'APOUSIA', recordedAt: t('18:00') },
      { userId: 'b', status: 'PAROUSIA', recordedAt: t('18:00') },
      { userId: 'c', status: 'PAROUSIA', recordedAt: t('18:00') },
    ]);
    expect(result.toWrite.map((e) => e.userId).sort()).toEqual(['b', 'c']);
    expect(result.stale.map((e) => e.userId)).toEqual(['a']);
  });
});
