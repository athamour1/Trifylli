import {
  COLLAB_SCALARS,
  ITEM_DOC,
  MEAL_DOC,
  ROW_LIMITS,
  clampInt,
  type IngredientSnapshot,
  type PlanYlikoSnapshot,
} from '@trifylli/shared';
import { Map as YMap, type Doc } from 'yjs';
import { projectedText } from '../collab/collab-fields';

/**
 * Το στοιχείο του ωρολογίου (`ITEM_DOC`) και το γεύμα (`MEAL_DOC`) ως κοινά
 * έγγραφα: γέμισμα από τη βάση, αναβάθμιση παλιών εγγράφων (που είχαν μόνο το
 * κείμενο), ανάγνωση, και κανονικοποίηση πριν γραφτούν πίσω στη βάση.
 *
 * Οι λίστες είναι χάρτες id → γραμμή, με τη σειρά ως αριθμό (`order`): δύο που
 * προσθέτουν μαζί κρατιούνται και οι δύο, και μια γραμμή δεν ξαναγράφεται για
 * να αλλάξει θέση.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function seedRows(doc: Doc, key: string, rows: readonly { id: string }[]): void {
  const map = doc.getMap<YMap<unknown>>(key);
  for (const { id, ...fields } of rows) {
    const row = new YMap<unknown>();
    for (const [field, value] of Object.entries(fields)) row.set(field, value);
    map.set(id, row);
  }
}

/** Οι γραμμές με τη σειρά τους — ίσοι αριθμοί (δύο που πρόσθεσαν μαζί) κατά id, ίδια σε κάθε συσκευή. */
function readRows(doc: Doc, key: string): { id: string; order: number; row: YMap<unknown> }[] {
  const rows: { id: string; order: number; row: YMap<unknown> }[] = [];
  for (const [id, row] of doc.getMap<unknown>(key).entries()) {
    if (row instanceof YMap) rows.push({ id, order: Number(row.get('order') ?? 0) || 0, row });
  }
  return rows.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Γραμμές που γράφονται: έγκυρο id, όνομα, όχι πάνω από το όριο — με ακέραια σειρά. */
function keptRows<T extends { id: string; label: string }>(rows: readonly T[]): T[] {
  return rows.filter((row) => UUID.test(row.id) && row.label.trim()).slice(0, ROW_LIMITS.rows);
}

// ───────────────────────── Στοιχείο του ωρολογίου ─────────────────────────

export interface ItemRows {
  description: string | null;
  location: string | null;
  yliko: PlanYlikoSnapshot[];
}

export interface ItemSnapshot {
  description: string;
  location: string;
  yliko: PlanYlikoSnapshot[];
}

/** Ό,τι γράφεται στη βάση. */
export interface ItemWrite {
  description: string | null;
  location: string | null;
  yliko: PlanYlikoSnapshot[];
}

/** Πρώτο γέμισμα — **μόνο** ο server (βλ. `seedTexts`). */
export function seedItem(doc: Doc, rows: ItemRows): void {
  doc.transact(() => {
    if (rows.description) doc.getText(ITEM_DOC.description).insert(0, rows.description);
    upgradeItem(doc, rows);
  });
}

/** Έγγραφο της δομής 1 (μόνο το προγραμματικό): χώρος και υλικό από τη βάση. */
export function upgradeItem(doc: Doc, rows: Pick<ItemRows, 'location' | 'yliko'>): void {
  doc.transact(() => {
    const fields = doc.getMap<unknown>(COLLAB_SCALARS);
    if (!fields.has(ITEM_DOC.location)) fields.set(ITEM_DOC.location, rows.location ?? '');
    if (doc.getMap(ITEM_DOC.yliko).size === 0) seedRows(doc, ITEM_DOC.yliko, rows.yliko);
  });
}

export function readItem(doc: Doc): ItemSnapshot {
  return {
    description: doc.getText(ITEM_DOC.description).toString(),
    location: text(doc.getMap<unknown>(COLLAB_SCALARS).get(ITEM_DOC.location)),
    yliko: readRows(doc, ITEM_DOC.yliko).map(({ id, order, row }) => ({
      id,
      order,
      label: text(row.get('label')),
      qty: Number(row.get('qty') ?? 1),
      packed: row.get('packed') === true,
    })),
  };
}

/** Λάθος τιμές διορθώνονται, δεν απορρίπτονται (ερώτημα 6). */
export function normalizeItem(item: ItemSnapshot): ItemWrite {
  return {
    description: projectedText(item.description),
    location: item.location.trim().slice(0, ROW_LIMITS.location) || null,
    yliko: keptRows(item.yliko).map((y, order) => ({
      id: y.id,
      order,
      label: y.label.trim().slice(0, ROW_LIMITS.label),
      qty: clampInt(y.qty, ROW_LIMITS.ylikoQty, 1),
      packed: y.packed === true,
    })),
  };
}

// ───────────────────────── Γεύμα ─────────────────────────

export interface MealRows {
  recipe: string | null;
  menu: string | null;
  ingredients: IngredientSnapshot[];
}

export interface MealSnapshot {
  recipe: string;
  menu: string;
  ingredients: IngredientSnapshot[];
}

export interface MealWrite {
  recipe: string | null;
  menu: string | null;
  ingredients: IngredientSnapshot[];
}

export function seedMeal(doc: Doc, rows: MealRows): void {
  doc.transact(() => {
    if (rows.recipe) doc.getText(MEAL_DOC.recipe).insert(0, rows.recipe);
    upgradeMeal(doc, rows);
  });
}

/** Έγγραφο της δομής 1 (μόνο η συνταγή): μενού και ποσολόγιο από τη βάση. */
export function upgradeMeal(doc: Doc, rows: Pick<MealRows, 'menu' | 'ingredients'>): void {
  doc.transact(() => {
    const fields = doc.getMap<unknown>(COLLAB_SCALARS);
    if (!fields.has(MEAL_DOC.menu)) fields.set(MEAL_DOC.menu, rows.menu ?? '');
    if (doc.getMap(MEAL_DOC.ingredients).size === 0) seedRows(doc, MEAL_DOC.ingredients, rows.ingredients);
  });
}

export function readMeal(doc: Doc): MealSnapshot {
  return {
    recipe: doc.getText(MEAL_DOC.recipe).toString(),
    menu: text(doc.getMap<unknown>(COLLAB_SCALARS).get(MEAL_DOC.menu)),
    ingredients: readRows(doc, MEAL_DOC.ingredients).map(({ id, order, row }) => ({
      id,
      order,
      label: text(row.get('label')),
      qty: text(row.get('qty')),
      bought: row.get('bought') === true,
    })),
  };
}

export function normalizeMeal(meal: MealSnapshot): MealWrite {
  return {
    recipe: projectedText(meal.recipe),
    menu: meal.menu.trim().slice(0, ROW_LIMITS.menu) || null,
    ingredients: keptRows(meal.ingredients).map((y, order) => ({
      id: y.id,
      order,
      label: y.label.trim().slice(0, ROW_LIMITS.label),
      qty: y.qty.trim().slice(0, ROW_LIMITS.ingredientQty),
      bought: y.bought === true,
    })),
  };
}
