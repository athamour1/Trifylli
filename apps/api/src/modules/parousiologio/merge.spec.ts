import { describe, expect, it } from 'vitest';
import { incomingEntries, mergeParousies } from './merge';

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
    // Ούτε «παλαιότερη»: είναι η ίδια σήμανση, ήδη γραμμένη.
    expect(result.stale).toHaveLength(0);
  });

  it('ίδια ώρα αλλά άλλη σήμανση: κρατά την υπάρχουσα και το λέει', () => {
    const existing = [{ userId: 'a', status: 'PAROUSIA', note: null, recordedAt: t('18:00') }];
    const result = mergeParousies(existing, [{ userId: 'a', status: 'APOUSIA', recordedAt: t('18:00') }]);
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

describe('κάθε σήμανση με τη δική της ώρα', () => {
  it('η ώρα της σήμανσης κερδίζει την ώρα της αποστολής', () => {
    const sent = t('18:30');
    expect(
      incomingEntries([{ memberId: 'a', status: 'PAROUSIA', recordedAt: t('18:05') }, { memberId: 'b', status: 'APOUSIA' }], sent),
    ).toEqual([
      { userId: 'a', status: 'PAROUSIA', note: null, recordedAt: t('18:05') },
      { userId: 'b', status: 'APOUSIA', note: null, recordedAt: sent },
    ]);
  });

  it('δύο στελέχη σημειώνουν μαζί διαφορετικά παιδιά: δεν σβήνει το ένα τα παιδιά του άλλου', () => {
    // Η Μαρία σημείωσε τον a στις 18:01· η Σοφία, με παλιό φύλλο, στέλνει μόνο τον b (18:02).
    const existing = [{ userId: 'a', status: 'PAROUSIA', note: null, recordedAt: t('18:01') }];
    const result = mergeParousies(existing, incomingEntries([{ memberId: 'b', status: 'APOUSIA', recordedAt: t('18:02') }], t('18:02')));
    expect(result.toWrite.map((e) => e.userId)).toEqual(['b']);
  });
});

describe('η ίδια σήμανση δεύτερη φορά', () => {
  it('δεν γράφεται ξανά και δεν μετράει ως «παλαιότερη»', () => {
    // Η σελίδα και η ουρά της συσκευής μπορεί να στείλουν την ίδια σήμανση.
    const existing = [{ userId: 'a', status: 'PAROUSIA', note: null, recordedAt: t('18:00') }];
    const result = mergeParousies(existing, [{ userId: 'a', status: 'PAROUSIA', note: null, recordedAt: t('18:00') }]);
    expect(result).toEqual({ toWrite: [], stale: [] });
  });
});
