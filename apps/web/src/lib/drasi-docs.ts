import {
  COLLAB_META,
  COLLAB_SCALARS,
  COLLAB_SCHEMA_KEY,
  ITEM_DOC,
  MEAL_DOC,
  ROW_LIMITS,
  clampInt,
  type IngredientSnapshot,
  type ItemYlikoSnapshot,
} from '@trifylli/shared';
import { Map as YMap, type Doc } from 'yjs';

/**
 * Το στοιχείο του ωρολογίου (`ITEM_DOC`) και το γεύμα (`MEAL_DOC`) πάνω στο
 * κοινό τους έγγραφο: ανάγνωση για τη σελίδα και οι μικρές αλλαγές της. Το
 * κείμενο (προγραμματικό, συνταγή) το γράφει ο επεξεργαστής· εδώ τα υπόλοιπα.
 *
 * Κάθε αλλαγή αγγίζει ένα πεδίο μιας γραμμής: δύο που γράφουν μαζί στην ίδια
 * λίστα δεν σβήνουν ο ένας τον άλλον.
 */

/** Το έγγραφο έχει έρθει από τον server με αυτή τη δομή (βλ. `COLLAB_SCHEMA_KEY`). */
export function hasSchema(doc: Doc, schema: number): boolean {
  const value = doc.getMap(COLLAB_META).get(COLLAB_SCHEMA_KEY);
  return typeof value === 'number' && value >= schema;
}

// ───────────────────────── Λίστες ─────────────────────────

/** Οι γραμμές με τη σειρά τους — ίδια ταξινόμηση με τον server. */
function rowsOf(doc: Doc, key: string): { id: string; order: number; row: YMap<unknown> }[] {
  const rows: { id: string; order: number; row: YMap<unknown> }[] = [];
  for (const [id, row] of doc.getMap<unknown>(key).entries()) {
    if (row instanceof YMap) rows.push({ id, order: Number(row.get('order') ?? 0) || 0, row });
  }
  return rows.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** Νέα γραμμή μετά από άλλη (ή στην αρχή): αριθμός σειράς ανάμεσα στους δύο γείτονες. */
function addRowAfter(doc: Doc, key: string, afterId: string | null, fields: Record<string, unknown>): string {
  const rows = rowsOf(doc, key);
  const index = afterId ? rows.findIndex((r) => r.id === afterId) : -1;
  const before = index >= 0 ? rows[index]!.order : (rows[0]?.order ?? 1) - 1;
  const after = rows[index + 1]?.order;
  const order = after === undefined ? before + 1 : (before + after) / 2;
  const id = crypto.randomUUID();
  doc.transact(() => {
    const row = new YMap<unknown>();
    row.set('order', order);
    for (const [field, value] of Object.entries(fields)) row.set(field, value);
    doc.getMap<YMap<unknown>>(key).set(id, row);
  });
  return id;
}

function updateRow(doc: Doc, key: string, id: string, change: Record<string, unknown>): void {
  const row = doc.getMap<YMap<unknown>>(key).get(id);
  if (!(row instanceof YMap)) return;
  doc.transact(() => {
    for (const [field, value] of Object.entries(change)) if (value !== undefined) row.set(field, value);
  });
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/** Ένα τικ γράφει και ποιος και πότε· το ξε-τικ τα σβήνει. */
function tick(on: boolean | undefined, by: string | null): { by: string | null | undefined; at: string | null | undefined } {
  if (on === undefined) return { by: undefined, at: undefined };
  return on ? { by, at: new Date().toISOString() } : { by: null, at: null };
}
const scalars = (doc: Doc) => doc.getMap<unknown>(COLLAB_SCALARS);

// ───────────────────────── Στοιχείο του ωρολογίου ─────────────────────────

export function readItemDoc(doc: Doc): { location: string; yliko: ItemYlikoSnapshot[] } {
  return {
    location: text(scalars(doc).get(ITEM_DOC.location)),
    yliko: rowsOf(doc, ITEM_DOC.yliko).map(({ id, order, row }) => ({
      id,
      order,
      label: text(row.get('label')),
      qty: Number(row.get('qty') ?? 1),
      packed: row.get('packed') === true,
      packedBy: textOrNull(row.get('packedBy')),
      packedAt: textOrNull(row.get('packedAt')),
    })),
  };
}

export function setLocation(doc: Doc, value: string): void {
  scalars(doc).set(ITEM_DOC.location, value.slice(0, ROW_LIMITS.location));
}

export function addItemYlikoAfter(doc: Doc, afterId: string | null): string {
  return addRowAfter(doc, ITEM_DOC.yliko, afterId, { label: '', qty: 1, packed: false });
}

/** `by`: όποιος τσεκάρει — μένει δίπλα στο τικ μαζί με την ώρα. */
export function updateItemYliko(doc: Doc, id: string, change: { label?: string; qty?: number; packed?: boolean }, by: string | null = null): void {
  const ticked = tick(change.packed, by);
  updateRow(doc, ITEM_DOC.yliko, id, {
    label: change.label?.slice(0, ROW_LIMITS.label),
    qty: change.qty === undefined ? undefined : clampInt(change.qty, ROW_LIMITS.ylikoQty, 1),
    packed: change.packed,
    packedBy: ticked.by,
    packedAt: ticked.at,
  });
}

export function removeItemYliko(doc: Doc, id: string): void {
  doc.getMap(ITEM_DOC.yliko).delete(id);
}

// ───────────────────────── Γεύμα ─────────────────────────

export function readMealDoc(doc: Doc): { menu: string; ingredients: IngredientSnapshot[] } {
  return {
    menu: text(scalars(doc).get(MEAL_DOC.menu)),
    ingredients: rowsOf(doc, MEAL_DOC.ingredients).map(({ id, order, row }) => ({
      id,
      order,
      label: text(row.get('label')),
      qty: text(row.get('qty')),
      bought: row.get('bought') === true,
      boughtBy: textOrNull(row.get('boughtBy')),
      boughtAt: textOrNull(row.get('boughtAt')),
    })),
  };
}

export function setMenu(doc: Doc, value: string): void {
  scalars(doc).set(MEAL_DOC.menu, value.slice(0, ROW_LIMITS.menu));
}

export function addIngredientAfter(doc: Doc, afterId: string | null): string {
  return addRowAfter(doc, MEAL_DOC.ingredients, afterId, { label: '', qty: '', bought: false });
}

export function updateIngredient(doc: Doc, id: string, change: { label?: string; qty?: string; bought?: boolean }, by: string | null = null): void {
  const ticked = tick(change.bought, by);
  updateRow(doc, MEAL_DOC.ingredients, id, {
    label: change.label?.slice(0, ROW_LIMITS.label),
    qty: change.qty?.slice(0, ROW_LIMITS.ingredientQty),
    bought: change.bought,
    boughtBy: ticked.by,
    boughtAt: ticked.at,
  });
}

export function removeIngredient(doc: Doc, id: string): void {
  doc.getMap(MEAL_DOC.ingredients).delete(id);
}
