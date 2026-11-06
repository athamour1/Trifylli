import { EXARTYSI_KEYS, EXARTYSI_LIMITS, type DrasiExartysiView } from '@trifylli/shared';
import { Map as YMap, type Doc } from 'yjs';

/**
 * Η εξάρτυση πάνω στο κοινό της έγγραφο (`drasi:<id>:exartysi`, βλ.
 * `EXARTYSI_KEYS`): ανάγνωση για τη σελίδα και οι μικρές αλλαγές της. Κάθε
 * αλλαγή αγγίζει ένα πεδίο μιας γραμμής — δύο που γράφουν μαζί σε διαφορετικές
 * γραμμές δεν σβήνουν ο ένας τον άλλον. Μια μετακίνηση αλλάζει μόνο τη σειρά.
 */

interface Row {
  id: string;
  order: number;
  row: YMap<unknown>;
}

function rowsOf(doc: Doc, key: string): Row[] {
  const rows: Row[] = [];
  for (const [id, row] of doc.getMap<unknown>(key).entries()) {
    if (row instanceof YMap) rows.push({ id, order: Number(row.get('order') ?? 0) || 0, row });
  }
  return rows.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

const sectionsOf = (doc: Doc) => doc.getMap<YMap<unknown>>(EXARTYSI_KEYS.sections);
const itemsOf = (doc: Doc) => doc.getMap<YMap<unknown>>(EXARTYSI_KEYS.items);

/** Το έγγραφο έχει έρθει από τον server (το γέμισε με το πρότυπο ή τη βάση). */
export function exartysiSeeded(doc: Doc): boolean {
  return doc.getMap(EXARTYSI_KEYS.info).has('title');
}

/** Ίδια ταξινόμηση με τον server· τα είδη ενότητας που σβήστηκε δεν φαίνονται. */
export function readExartysi(doc: Doc): DrasiExartysiView {
  const info = doc.getMap<unknown>(EXARTYSI_KEYS.info);
  const items = rowsOf(doc, EXARTYSI_KEYS.items);
  return {
    title: String(info.get('title') ?? ''),
    footer: String(info.get('footer') ?? ''),
    sections: rowsOf(doc, EXARTYSI_KEYS.sections).map(({ id, row }) => ({
      id,
      title: String(row.get('title') ?? ''),
      note: String(row.get('note') ?? ''),
      items: items.filter((item) => item.row.get('section') === id).map((item) => ({ id: item.id, label: String(item.row.get('label') ?? '') })),
    })),
  };
}

export function setInfo(doc: Doc, field: 'title' | 'footer', value: string): void {
  doc.getMap<unknown>(EXARTYSI_KEYS.info).set(field, value.slice(0, EXARTYSI_LIMITS[field]));
}

/** Σειρά ανάμεσα σε μια γραμμή και την επόμενη (ή στο τέλος). */
function orderAfter(rows: Row[], afterId: string | null): number {
  if (afterId === null) return (rows.at(-1)?.order ?? 0) + 1;
  const index = rows.findIndex((r) => r.id === afterId);
  if (index < 0) return (rows.at(-1)?.order ?? 0) + 1;
  const next = rows[index + 1];
  return next ? (rows[index]!.order + next.order) / 2 : rows[index]!.order + 1;
}

/** Νέα ενότητα μετά από άλλη (ή στο τέλος). */
export function addSection(doc: Doc, afterId: string | null = null): string {
  const id = crypto.randomUUID();
  const order = orderAfter(rowsOf(doc, EXARTYSI_KEYS.sections), afterId);
  doc.transact(() => {
    const row = new YMap<unknown>();
    row.set('order', order);
    row.set('title', '');
    row.set('note', '');
    sectionsOf(doc).set(id, row);
  });
  return id;
}

export function updateSection(doc: Doc, id: string, change: { title?: string; note?: string }): void {
  const row = sectionsOf(doc).get(id);
  if (!(row instanceof YMap)) return;
  doc.transact(() => {
    if (change.title !== undefined) row.set('title', change.title.slice(0, EXARTYSI_LIMITS.title));
    if (change.note !== undefined) row.set('note', change.note.slice(0, EXARTYSI_LIMITS.note));
  });
}

/** Η ενότητα φεύγει μαζί με τα είδη της. */
export function removeSection(doc: Doc, id: string): void {
  doc.transact(() => {
    sectionsOf(doc).delete(id);
    for (const item of rowsOf(doc, EXARTYSI_KEYS.items)) {
      if (item.row.get('section') === id) itemsOf(doc).delete(item.id);
    }
  });
}

/** Πάνω/κάτω: ανταλλαγή αριθμών σειράς με τον γείτονα. */
function swap(doc: Doc, rows: Row[], id: string, step: -1 | 1): void {
  const index = rows.findIndex((r) => r.id === id);
  const other = rows[index + step];
  const current = rows[index];
  if (!current || !other) return;
  doc.transact(() => {
    // Ίσοι αριθμοί (σπάνιο): δίνουμε σε όλη τη λίστα καθαρή σειρά πρώτα.
    if (current.order === other.order) rows.forEach((r, i) => r.row.set('order', i + 1));
    const a = Number(current.row.get('order'));
    const b = Number(other.row.get('order'));
    current.row.set('order', b);
    other.row.set('order', a);
  });
}

export function moveSection(doc: Doc, id: string, step: -1 | 1): void {
  swap(doc, rowsOf(doc, EXARTYSI_KEYS.sections), id, step);
}

function itemsIn(doc: Doc, section: string): Row[] {
  return rowsOf(doc, EXARTYSI_KEYS.items).filter((item) => item.row.get('section') === section);
}

/** Νέο είδος στην ενότητα, μετά από άλλο (ή στο τέλος). */
export function addItem(doc: Doc, section: string, afterId: string | null = null, label = ''): string {
  const id = crypto.randomUUID();
  const order = orderAfter(itemsIn(doc, section), afterId);
  doc.transact(() => {
    const row = new YMap<unknown>();
    row.set('section', section);
    row.set('order', order);
    row.set('label', label.slice(0, EXARTYSI_LIMITS.label));
    itemsOf(doc).set(id, row);
  });
  return id;
}

export function updateItem(doc: Doc, id: string, label: string): void {
  const row = itemsOf(doc).get(id);
  if (row instanceof YMap) row.set('label', label.slice(0, EXARTYSI_LIMITS.label));
}

export function removeItem(doc: Doc, id: string): void {
  itemsOf(doc).delete(id);
}

export function moveItem(doc: Doc, id: string, step: -1 | 1): void {
  const row = itemsOf(doc).get(id);
  if (!(row instanceof YMap)) return;
  swap(doc, itemsIn(doc, String(row.get('section'))), id, step);
}
