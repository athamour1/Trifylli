import { describe, expect, it } from 'vitest';
import { COLLAB_META, COLLAB_SCHEMA_KEY } from '@trifylli/shared';
import { Doc, applyUpdate, encodeStateAsUpdate } from 'yjs';
import {
  addIngredientAfter,
  addItemYlikoAfter,
  hasSchema,
  readItemDoc,
  readMealDoc,
  removeIngredient,
  removeItemYliko,
  setLocation,
  setMenu,
  updateIngredient,
  updateItemYliko,
} from '../src/lib/drasi-docs';

function sync(a: Doc, b: Doc): void {
  applyUpdate(a, encodeStateAsUpdate(b));
  applyUpdate(b, encodeStateAsUpdate(a));
}

describe('στοιχείο του ωρολογίου — οι αλλαγές της σελίδας', () => {
  it('χώρος: απλή τιμή, μέσα στο όριο', () => {
    const doc = new Doc();
    setLocation(doc, `Ξέφωτο ${'α'.repeat(300)}`);
    expect(readItemDoc(doc).location).toHaveLength(200);
  });

  it('υλικό: νέα γραμμή μετά από άλλη, με τη σειρά της οθόνης, και ποσότητα μέσα στα όρια', () => {
    const doc = new Doc();
    const rope = addItemYlikoAfter(doc, null);
    const map = addItemYlikoAfter(doc, rope);
    updateItemYliko(doc, rope, { label: 'Σχοινί', qty: 2 });
    updateItemYliko(doc, map, { label: 'Χάρτης' });
    const torch = addItemYlikoAfter(doc, rope);
    updateItemYliko(doc, torch, { label: 'Φακός', qty: 0, packed: true });

    expect(readItemDoc(doc).yliko.map((y) => [y.label, y.qty, y.packed])).toEqual([
      ['Σχοινί', 2, false],
      ['Φακός', 1, true],
      ['Χάρτης', 1, false],
    ]);

    removeItemYliko(doc, torch);
    expect(readItemDoc(doc).yliko.map((y) => y.label)).toEqual(['Σχοινί', 'Χάρτης']);
  });

  it('δύο που τσεκάρουν και γράφουν μαζί στην ίδια λίστα δεν σβήνουν ο ένας τον άλλον', () => {
    const maria = new Doc();
    const rope = addItemYlikoAfter(maria, null);
    updateItemYliko(maria, rope, { label: 'Σχοινί' });
    const sofia = new Doc();
    sync(sofia, maria);

    updateItemYliko(maria, rope, { packed: true });
    updateItemYliko(sofia, addItemYlikoAfter(sofia, rope), { label: 'Πυξίδα' });
    sync(maria, sofia);

    expect(readItemDoc(maria).yliko.map((y) => [y.label, y.packed])).toEqual([
      ['Σχοινί', true],
      ['Πυξίδα', false],
    ]);
  });
});

describe('γεύμα — οι αλλαγές της σελίδας', () => {
  it('μενού και ποσολόγιο', () => {
    const doc = new Doc();
    setMenu(doc, 'Μακαρόνια με κιμά');
    const pasta = addIngredientAfter(doc, null);
    updateIngredient(doc, pasta, { label: 'Μακαρόνια', qty: '4 kg' });
    const salt = addIngredientAfter(doc, pasta);
    updateIngredient(doc, salt, { label: 'Αλάτι', bought: true }, 'u-maria');

    expect(readMealDoc(doc)).toEqual({
      menu: 'Μακαρόνια με κιμά',
      ingredients: [
        { id: pasta, order: 1, label: 'Μακαρόνια', qty: '4 kg', bought: false, boughtBy: null, boughtAt: null },
        { id: salt, order: 2, label: 'Αλάτι', qty: '', bought: true, boughtBy: 'u-maria', boughtAt: expect.any(String) },
      ],
    });

    // Ξε-τικ: φεύγουν και το ποιος και το πότε.
    updateIngredient(doc, salt, { bought: false }, 'u-maria');
    expect(readMealDoc(doc).ingredients[1]).toMatchObject({ bought: false, boughtBy: null, boughtAt: null });

    removeIngredient(doc, pasta);
    expect(readMealDoc(doc).ingredients.map((y) => y.label)).toEqual(['Αλάτι']);
  });
});

describe('δομή εγγράφου', () => {
  it('τα νέα πεδία γράφονται μόνο αφού το έγγραφο έρθει από τον server με τη νέα δομή', () => {
    const doc = new Doc();
    expect(hasSchema(doc, 2)).toBe(false);
    doc.getMap(COLLAB_META).set(COLLAB_SCHEMA_KEY, 2);
    expect(hasSchema(doc, 2)).toBe(true);
  });
});
