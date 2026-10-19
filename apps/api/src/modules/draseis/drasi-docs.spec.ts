import { describe, expect, it } from 'vitest';
import { COLLAB_SCALARS, ITEM_DOC, MEAL_DOC } from '@trifylli/shared';
import { Doc, Map as YMap, applyUpdate, encodeStateAsUpdate } from 'yjs';
import {
  normalizeItem,
  normalizeMeal,
  presentItem,
  presentMeal,
  readItem,
  readMeal,
  restoreItem,
  restoreMeal,
  seedItem,
  seedMeal,
  tickMealIngredient,
  upgradeItem,
  upgradeMeal,
} from './drasi-docs';

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
      { id: id(1), order: 0, label: 'Σχοινί', qty: 2, packed: false, packedBy: null, packedAt: null },
      { id: id(2), order: 1, label: 'Πυξίδα', qty: 1, packed: true, packedBy: null, packedAt: null },
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

    addRow(maria, ITEM_DOC.yliko, id(3), { order: 2, label: 'Φακός', qty: 1, packed: false, packedBy: null, packedAt: null });
    addRow(sofia, ITEM_DOC.yliko, id(4), { order: 2, label: 'Σφυρίχτρα', qty: 1, packed: false, packedBy: null, packedAt: null });
    sync(maria, sofia);

    expect(readItem(maria).yliko.map((y) => y.label)).toEqual(['Σχοινί', 'Πυξίδα', 'Φακός', 'Σφυρίχτρα']);
    expect(readItem(sofia)).toEqual(readItem(maria));
  });

  it('κανονικοποίηση: διορθώνει αντί να απορρίπτει', () => {
    const doc = new Doc();
    seedItem(doc, { description: '  ', location: `  ${'α'.repeat(250)}  `, yliko: rows.yliko });
    addRow(doc, ITEM_DOC.yliko, id(5), { order: 0.5, label: '  Χάρτης  ', qty: 5000, packed: 'ναι' });
    addRow(doc, ITEM_DOC.yliko, id(6), { order: 3, label: '   ', qty: 1, packed: false, packedBy: null, packedAt: null });
    addRow(doc, ITEM_DOC.yliko, 'όχι-id', { order: 4, label: 'Παράξενο', qty: 1, packed: false, packedBy: null, packedAt: null });

    const write = normalizeItem(readItem(doc));

    expect(write.description).toBeNull();
    expect(write.location).toHaveLength(200);
    expect(write.yliko).toEqual([
      { id: id(1), order: 0, label: 'Σχοινί', qty: 2, packed: false, packedById: null, packedAt: null },
      { id: id(5), order: 1, label: 'Χάρτης', qty: 999, packed: false, packedById: null, packedAt: null },
      { id: id(2), order: 2, label: 'Πυξίδα', qty: 1, packed: true, packedById: null, packedAt: null },
    ]);
  });
});

describe('γεύμα ως κοινό έγγραφο', () => {
  const rows = {
    recipe: 'Βράζουμε το νερό…',
    menu: 'Μακαρόνια με κιμά, σαλάτα',
    ingredients: [
      { id: id(11), order: 0, label: 'Μακαρόνια', qty: '4 kg', bought: false, boughtBy: null, boughtAt: null },
      { id: id(12), order: 1, label: 'Κιμάς', qty: '3 kg', bought: true, boughtBy: null, boughtAt: null },
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
    addRow(doc, MEAL_DOC.ingredients, id(13), { order: 1.5, label: ' Αλάτι ', qty: ` ${'1'.repeat(80)} `, bought: false, boughtBy: null, boughtAt: null });
    addRow(doc, MEAL_DOC.ingredients, id(14), { order: 2, label: '', qty: '1', bought: false, boughtBy: null, boughtAt: null });

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

describe('ιστορικό του στοιχείου και του γεύματος', () => {
  it('στοιχείο: η έκδοση ξαναγίνεται έγγραφο — κείμενο, χώρος, υλικό — και διαβάζεται ως γραμμές', () => {
    const doc = new Doc();
    seedItem(doc, { description: 'Πορεία από το ρέμα.', location: 'Ξέφωτο', yliko: [{ id: id(1), order: 0, label: 'Σχοινί', qty: 2, packed: true, packedBy: null, packedAt: null }] });
    const version = JSON.parse(JSON.stringify(readItem(doc))) as Record<string, unknown>;

    doc.getText(ITEM_DOC.description).insert(0, 'Αλλαγή. ');
    doc.getMap<unknown>(COLLAB_SCALARS).set(ITEM_DOC.location, 'Αλλού');
    addRow(doc, ITEM_DOC.yliko, id(2), { order: 1, label: 'Πυξίδα', qty: 1, packed: false, packedBy: null, packedAt: null });
    restoreItem(doc, version);

    expect(readItem(doc)).toEqual(version);
    expect(presentItem(version).map((part) => [part.label, part.text])).toEqual([
      ['Προγραμματικό', 'Πορεία από το ρέμα.'],
      ['Χώρος', 'Ξέφωτο'],
      ['Υλικό', '- Σχοινί ×2 ✓'],
    ]);
  });

  it('γεύμα: συνταγή, μενού και ποσολόγιο όπως ήταν', () => {
    const doc = new Doc();
    seedMeal(doc, { recipe: 'Βράζουμε.', menu: 'Μακαρόνια', ingredients: [{ id: id(1), order: 0, label: 'Ζυμαρικά', qty: '2 kg', bought: false, boughtBy: null, boughtAt: null }] });
    const version = JSON.parse(JSON.stringify(readMeal(doc))) as Record<string, unknown>;

    doc.getMap<YMap<unknown>>(MEAL_DOC.ingredients).delete(id(1));
    doc.getText(MEAL_DOC.recipe).delete(0, 3);
    restoreMeal(doc, version);

    expect(readMeal(doc)).toEqual(version);
    expect(presentMeal(version).at(-1)?.text).toBe('- Ζυμαρικά — 2 kg');
  });
});

describe('ποιος και πότε σε κάθε τικ', () => {
  it('κρατιέται όσο είναι τσεκαρισμένο — χωρίς άκυρα id ή ώρες στο μέλλον', () => {
    const doc = new Doc();
    const at = '2026-10-01T08:00:00.000Z';
    seedItem(doc, {
      description: '',
      location: '',
      yliko: [
        { id: id(1), order: 0, label: 'Σχοινί', qty: 1, packed: true, packedBy: id(90), packedAt: at },
        { id: id(2), order: 1, label: 'Φακός', qty: 1, packed: false, packedBy: id(90), packedAt: at },
        { id: id(3), order: 2, label: 'Πυξίδα', qty: 1, packed: true, packedBy: 'όχι-id', packedAt: '2999-01-01T00:00:00Z' },
      ],
    });
    expect(normalizeItem(readItem(doc)).yliko.map((y) => [y.packedById, y.packedAt?.toISOString() ?? null])).toEqual([
      [id(90), at],
      [null, null],
      [null, null],
    ]);
  });
});

describe('«αγοράστηκε» από τη λίστα της Τροφοδοσίας', () => {
  function meal(): Doc {
    const doc = new Doc();
    seedMeal(doc, {
      recipe: '',
      menu: 'Μακαρόνια',
      ingredients: [{ id: id(1), order: 0, label: 'Μακαρόνια', qty: '2 kg', bought: false, boughtBy: null, boughtAt: null }],
    });
    return doc;
  }

  it('γράφει τα ίδια με το τικ της σελίδας του γεύματος: ποιος και πότε', () => {
    const doc = meal();
    const at = new Date('2026-10-01T08:00:00.000Z');
    expect(tickMealIngredient(doc, id(1), true, id(90), at)).toBe(true);
    expect(normalizeMeal(readMeal(doc)).ingredients).toEqual([
      { id: id(1), order: 0, label: 'Μακαρόνια', qty: '2 kg', bought: true, boughtById: id(90), boughtAt: at },
    ]);
  });

  it('το ξε-τικ σβήνει ποιος και πότε· γραμμή που δεν υπάρχει πια: false', () => {
    const doc = meal();
    tickMealIngredient(doc, id(1), true, id(90));
    expect(tickMealIngredient(doc, id(1), false, id(90))).toBe(true);
    expect(normalizeMeal(readMeal(doc)).ingredients[0]).toMatchObject({ bought: false, boughtById: null, boughtAt: null });
    expect(tickMealIngredient(doc, id(7), true, id(90))).toBe(false);
  });
});
