import { describe, expect, it } from 'vitest';
import { toExternalAccountRow } from './external-accounts';

const drasi = (over: Partial<{ id: string; title: string; status: string; archivedAt: Date | null }>) => ({
  id: 'd1',
  title: 'Κατασκήνωση',
  status: 'ENERGI',
  archivedAt: null,
  klados: { type: 'ODIGOI' },
  ...over,
});

const row = (draseis: ReturnType<typeof drasi>[], over: Partial<{ ssoId: string | null }> = {}) => ({
  id: 'u1',
  firstName: 'Μαρία',
  lastName: 'Παππά',
  email: 'maria@example.gr',
  phone: null,
  guestTopikoName: 'Ελευσίνα',
  ssoId: null,
  lastLoginAt: null,
  participations: draseis.map((d) => ({ drasi: d })),
  ...over,
});

describe('toExternalAccountRow', () => {
  it('ανοιχτή δράση: εκεί μπαίνει ακόμη', () => {
    expect(toExternalAccountRow(row([drasi({})])).draseis).toEqual([{ id: 'd1', title: 'Κατασκήνωση', klados: 'ODIGOI', open: true }]);
  });

  it('κλειστή ή αρχειοθετημένη δράση: φαίνεται, αλλά όχι ως ανοιχτή', () => {
    const r = toExternalAccountRow(row([drasi({ id: 'k', status: 'KLEISTI' }), drasi({ id: 'a', archivedAt: new Date('2026-10-07') })]));
    expect(r.draseis.map((d) => d.open)).toEqual([false, false]);
  });

  it('ενεργός μόνο όσος έχει συνδεθεί τουλάχιστον μία φορά', () => {
    expect(toExternalAccountRow(row([])).activated).toBe(false);
    expect(toExternalAccountRow(row([], { ssoId: 'sub-1' })).activated).toBe(true);
  });

  it('η προέλευση είναι το Τοπικό από όπου ήρθε', () => {
    expect(toExternalAccountRow(row([])).origin).toBe('Ελευσίνα');
  });
});
