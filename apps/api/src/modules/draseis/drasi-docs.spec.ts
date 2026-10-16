import { describe, expect, it } from 'vitest';
import { COLLAB_SCALARS, ITEM_DOC, MEAL_DOC } from '@trifylli/shared';
import { Doc, Map as YMap, applyUpdate, encodeStateAsUpdate } from 'yjs';
import { normalizeItem, normalizeMeal, readItem, readMeal, seedItem, seedMeal, upgradeItem, upgradeMeal } from './drasi-docs';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function sync(a: Doc, b: Doc): void {
  applyUpdate(a, encodeStateAsUpdate(b));
  applyUpdate(b, encodeStateAsUpdate(a));
}

/** Μια γραμμή όπως την προσθέτει ο client: νέο id, δικός της χάρτης. */
function addRow(doc: Doc, key: string, rowId: string, fields: Record<string, unknown>): void {
  const row = new YMap<unknown>();
  for (const [field, value] of Object.entries(fields)) row.set(field, value);
  doc.getMap<YMap<unknown>>(key).set(rowId, row);
}

describe('στοιχείο του ωρολογίου ως κοινό έγγραφο', () => {
  const rows = {
    description: '## Πορεία\nΑπό το ρέμα.',
    location: 'Ξέφωτο',
    yliko: [
      { id: id(1), order: 0, label: 'Σχοινί', qty: 2, packed: false },
      { id: id(2), order: 1, label: 'Πυξίδα', qty: 1, packed: true },
    ],
  };

  it('γεμίζει από τη βάση και διαβάζεται πίσω όπως ήταν', () => {
    const doc = new Doc();
    seedItem(doc, rows);
    expect(readItem(doc)).toEqual(rows);
  });

  it('παλιό έγγραφο (μόνο προγραμματικό): η αναβάθμιση φέρνει χώρο και υλικό χωρίς να αγγίξει το κείμενο', () => {
    const doc = new Doc();
    doc.getText(ITEM_DOC.description).insert(0, 'Γραμμένο μαζί από πριν.');
    upgradeItem(doc, { location: rows.location, yliko: rows.yliko });

    expect(readItem(doc)).toEqual({ ...rows, description: 'Γραμμένο μαζί από πριν.' });
  });

  it('δύο που προσθέτουν γραμμή μαζί: κρατιούνται και οι δύο', () => {
    const maria = new Doc();
    seedItem(maria, rows);
    const sofia = new Doc();
    sync(sofia, maria);

    addRow(maria, ITEM_DOC.yliko, id(3), { order: 2, label: 'Φακός', qty: 1, packed: false });
    addRow(sofia, ITEM_DOC.yliko, id(4), { order: 2, label: 'Σφυρίχτρα', qty: 1, packed: false });
    sync(maria, sofia);

    expect(readItem(maria).yliko.map((y) => y.label)).toEqual(['Σχοινί', 'Πυξίδα', 'Φακός', 'Σφυρίχτρα']);
    expect(readItem(sofia)).toEqual(readItem(maria));
  });

  it('κανονικοποίηση: διορθώνει αντί να απορρίπτει', () => {
    const doc = new Doc();
    seedItem(doc, { description: '  ', location: `  ${'α'.repeat(250)}  `, yliko: rows.yliko });
    addRow(doc, ITEM_DOC.yliko, id(5), { order: 0.5, label: '  Χάρτης  ', qty: 5000, packed: 'ναι' });
    addRow(doc, ITEM_DOC.yliko, id(6), { order: 3, label: '   ', qty: 1, packed: false });
    addRow(doc, ITEM_DOC.yliko, 'όχι-id', { order: 4, label: 'Παράξενο', qty: 1, packed: false });

    const write = normalizeItem(readItem(doc));

    expect(write.description).toBeNull();
    expect(write.location).toHaveLength(200);
    expect(write.yliko).toEqual([
      { id: id(1), order: 0, label: 'Σχοινί', qty: 2, packed: false },
      { id: id(5), order: 1, label: 'Χάρτης', qty: 999, packed: false },
      { id: id(2), order: 2, label: 'Πυξίδα', qty: 1, packed: true },
    ]);
  });
});

describe('γεύμα ως κοινό έγγραφο', () => {
  const rows = {
    recipe: 'Βράζουμε το νερό…',
    menu: 'Μακαρόνια με κιμά, σαλάτα',
    ingredients: [
      { id: id(11), order: 0, label: 'Μακαρόνια', qty: '4 kg', bought: false },
      { id: id(12), order: 1, label: 'Κιμάς', qty: '3 kg', bought: true },
    ],
  };

  it('γεμίζει από τη βάση και διαβάζεται πίσω όπως ήταν', () => {
    const doc = new Doc();
    seedMeal(doc, rows);
    expect(readMeal(doc)).toEqual(rows);
    expect(doc.getMap(COLLAB_SCALARS).get(MEAL_DOC.menu)).toBe(rows.menu);
  });

  it('παλιό έγγραφο (μόνο συνταγή): η αναβάθμιση φέρνει μενού και ποσολόγιο', () => {
    const doc = new Doc();
    doc.getText(MEAL_DOC.recipe).insert(0, 'Συνταγή από πριν.');
    upgradeMeal(doc, { menu: rows.menu, ingredients: rows.ingredients });

    expect(readMeal(doc)).toEqual({ ...rows, recipe: 'Συνταγή από πριν.' });
  });

  it('κανονικοποίηση: κενές γραμμές έξω, κείμενα μέσα στα όρια', () => {
    const doc = new Doc();
    seedMeal(doc, { recipe: '', menu: '   ', ingredients: rows.ingredients });
    addRow(doc, MEAL_DOC.ingredients, id(13), { order: 1.5, label: ' Αλάτι ', qty: ` ${'1'.repeat(80)} `, bought: false });
    addRow(doc, MEAL_DOC.ingredients, id(14), { order: 2, label: '', qty: '1', bought: false });

    const write = normalizeMeal(readMeal(doc));

    expect(write.recipe).toBeNull();
    expect(write.menu).toBeNull();
    expect(write.ingredients.map((y) => [y.id, y.order, y.label, y.qty.length, y.bought])).toEqual([
      [id(11), 0, 'Μακαρόνια', 4, false],
      [id(12), 1, 'Κιμάς', 4, true],
      [id(13), 2, 'Αλάτι', 60, false],
    ]);
  });
});
