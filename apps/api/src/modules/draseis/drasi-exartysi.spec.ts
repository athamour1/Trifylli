import { DEFAULT_EXARTYSI, EXARTYSI_KEYS, defaultParentLetter, greekDateSpan } from '@trifylli/shared';
import { describe, expect, it } from 'vitest';
import { Map as YMap, Doc } from 'yjs';
import { exartysiOrDefault, presentExartysi, readExartysi, readExartysiRows, restoreExartysi, seedExartysi } from './drasi-exartysi';

describe('εξάρτυση ως κοινό έγγραφο', () => {
  it('χωρίς αποθηκευμένη: το πρότυπο, με όλες τις ενότητες και τις σημειώσεις', () => {
    const view = exartysiOrDefault(null);
    expect(view.title).toBe(DEFAULT_EXARTYSI.title);
    expect(view.sections.map((s) => s.title)).toEqual(DEFAULT_EXARTYSI.sections.map((s) => s.title));
    expect(view.sections.find((s) => s.title === 'ΓΙΑ ΤΟ ΦΑΓΗΤΟ')?.note).toBe('Όλα να είναι μαρκαρισμένα');
  });

  it('γέμισμα και ανάγνωση δίνουν την ίδια εξάρτυση', () => {
    const view = exartysiOrDefault(null);
    const doc = new Doc();
    seedExartysi(doc, view);
    expect(readExartysi(doc)).toEqual(view);
  });

  it('νέα ενότητα, σβήσιμο ενότητας με τα είδη της, όρια', () => {
    const doc = new Doc();
    seedExartysi(doc, exartysiOrDefault(null));
    const sections = doc.getMap<YMap<unknown>>(EXARTYSI_KEYS.sections);
    const items = doc.getMap<YMap<unknown>>(EXARTYSI_KEYS.items);
    const [firstId] = [...sections.keys()];
    const fresh = new YMap<unknown>();
    fresh.set('order', 0.5);
    fresh.set('title', '  ΓΙΑ ΤΗ ΒΡΟΧΗ  ');
    fresh.set('note', '');
    sections.set('s-new', fresh);
    const item = new YMap<unknown>();
    item.set('section', 's-new');
    item.set('order', 1);
    item.set('label', 'x'.repeat(1000));
    items.set('i-new', item);
    // Η ενότητα «ΑΛΛΑ ΡΟΥΧΑ» φεύγει· τα είδη της μένουν ορφανά στο έγγραφο.
    const other = [...sections.entries()].find(([, row]) => row.get('title') === 'ΑΛΛΑ ΡΟΥΧΑ')![0];
    sections.delete(other);

    const view = readExartysi(doc);
    expect(view.sections[0]).toMatchObject({ id: 's-new', title: 'ΓΙΑ ΤΗ ΒΡΟΧΗ' });
    expect(view.sections[0]!.items[0]!.label).toHaveLength(300);
    expect(view.sections.some((s) => s.title === 'ΑΛΛΑ ΡΟΥΧΑ')).toBe(false);
    expect(view.sections.flatMap((s) => s.items).some((i) => i.label === 'Μαγιό')).toBe(false);
    expect(view.sections[1]!.id).toBe(firstId);
  });

  it('ιστορικό: η έκδοση επαναφέρεται και διαβάζεται', () => {
    const doc = new Doc();
    seedExartysi(doc, exartysiOrDefault(null));
    const version = { ...readExartysiRows(doc) };
    doc.getMap<YMap<unknown>>(EXARTYSI_KEYS.sections).clear();
    restoreExartysi(doc, version as unknown as Record<string, unknown>);
    expect(readExartysi(doc).sections).toHaveLength(DEFAULT_EXARTYSI.sections.length);
    const parts = presentExartysi(version as unknown as Record<string, unknown>);
    expect(parts.find((p) => p.label === 'ΠΑΠΟΥΤΣΙΑ')?.text).toContain('- Σαγιονάρες');
  });
});

describe('γράμμα προς τους γονείς — πρότυπο', () => {
  it('ημερομηνίες στα ελληνικά', () => {
    expect(greekDateSpan('2026-07-17T00:00:00Z', '2026-07-26T00:00:00Z')).toBe('από 17 έως 26 Ιουλίου');
    expect(greekDateSpan('2026-06-28T00:00:00Z', '2026-07-05T00:00:00Z')).toBe('από 28 Ιουνίου έως 5 Ιουλίου');
    expect(greekDateSpan('2026-07-17T00:00:00Z', '2026-07-17T00:00:00Z')).toBe('στις 17 Ιουλίου');
  });

  it('γεμίζει ό,τι ξέρει η δράση και αφήνει «…» τα υπόλοιπα', () => {
    const text = defaultParentLetter({
      type: 'KATASKINOSI',
      dateStart: '2026-07-17T00:00:00Z',
      dateEnd: '2026-07-26T00:00:00Z',
      location: 'Μεταμόρφωση Κοζάνης',
      costPerPerson: 240,
      costReduced: 210,
      guestTopika: ['Ελευσίνα', 'Χίος'],
      ourTopiko: 'Μέγαρα',
      arxigos: { name: 'Γεωργία Γεώργα', phone: '6900000000', email: null },
    });
    expect(text).toContain('**από 17 έως 26 Ιουλίου — Μεταμόρφωση Κοζάνης**');
    expect(text).toContain('Μέγαρα, Ελευσίνα και Χίος');
    expect(text).toContain('**Το κόστος συμμετοχής είναι 240€** και για τα αδέρφια που θα συμμετέχουν είναι **210€**');
    expect(text).toContain('Γεωργία Γεώργα');
    expect(text).toContain('email: …');
    expect(text).toContain('Η Αρχηγός της κατασκήνωσης');
  });
});
