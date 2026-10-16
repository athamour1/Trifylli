import { describe, expect, it } from 'vitest';
import { PLAN_KEYS } from '@trifylli/shared';
import { Doc, Map as YMap, Text as YText, applyUpdate, encodeStateAsUpdate } from 'yjs';
import {
  addBlock,
  addYlikoAfter,
  blockDescription,
  moveBlock,
  readPlan,
  removeBlock,
  setSectionDuration,
  setStelexos,
  typedNumber,
  updateBlock,
  updateYliko,
} from '../src/lib/syggentrwsh-plan';

/** Ό,τι γεμίζει ο server: τα τρία μέρη, πάντα. */
function seeded(): Doc {
  const doc = new Doc();
  const sections = doc.getMap<YMap<unknown>>(PLAN_KEYS.sections);
  for (const section of ['ANOIGMA', 'KYRIO_MEROS', 'KLEISIMO']) {
    const part = new YMap<unknown>();
    part.set('notes', new YText());
    part.set('durationMin', 0);
    sections.set(section, part);
  }
  return doc;
}

function sync(a: Doc, b: Doc): void {
  applyUpdate(a, encodeStateAsUpdate(b));
  applyUpdate(b, encodeStateAsUpdate(a));
}

describe('πρόγραμμα συγκέντρωσης — οι αλλαγές της σελίδας', () => {
  it('νέα κομμάτια μπαίνουν στο τέλος του μέρους και ανεβοκατεβαίνουν', () => {
    const doc = seeded();
    const a = addBlock(doc, 'KYRIO_MEROS');
    const b = addBlock(doc, 'KYRIO_MEROS');
    updateBlock(doc, a, { title: 'Κυνήγι' });
    updateBlock(doc, b, { title: 'Τραγούδι' });
    expect(readPlan(doc).blocks.map((x) => x.title)).toEqual(['Κυνήγι', 'Τραγούδι']);

    moveBlock(doc, b, -1);
    expect(readPlan(doc).blocks.map((x) => x.title)).toEqual(['Τραγούδι', 'Κυνήγι']);
  });

  it('τα λεπτά μένουν μέσα στα όρια', () => {
    const doc = seeded();
    const a = addBlock(doc, 'KYRIO_MEROS');
    updateBlock(doc, a, { durationMin: 0 });
    expect(readPlan(doc).blocks[0]?.durationMin).toBe(1);
    setSectionDuration(doc, 'ANOIGMA', 9999);
    expect(readPlan(doc).sections.ANOIGMA?.durationMin).toBe(600);
  });

  it('δύο προσθέτουν κομμάτι μαζί: κρατιούνται και τα δύο', () => {
    const maria = seeded();
    const sofia = new Doc();
    sync(sofia, maria);
    addBlock(maria, 'KYRIO_MEROS');
    addBlock(sofia, 'KYRIO_MEROS');
    sync(maria, sofia);
    expect(readPlan(maria).blocks).toHaveLength(2);
    expect(readPlan(sofia).blocks.map((b) => b.id)).toEqual(readPlan(maria).blocks.map((b) => b.id));
  });

  it('η μετακίνηση δεν σβήνει ό,τι γράφει άλλος στην περιγραφή του ίδιου κομματιού', () => {
    const maria = seeded();
    const first = addBlock(maria, 'KYRIO_MEROS');
    const second = addBlock(maria, 'KYRIO_MEROS');
    const sofia = new Doc();
    sync(sofia, maria);

    moveBlock(maria, second, -1);
    blockDescription(sofia, second)!.insert(0, 'Στίχοι στο φυλλάδιο.');
    sync(maria, sofia);

    expect(readPlan(maria).blocks.map((b) => b.id)).toEqual([second, first]);
    expect(readPlan(maria).blocks[0]?.description).toBe('Στίχοι στο φυλλάδιο.');
  });

  it('διαγραφή κομματιού', () => {
    const doc = seeded();
    const a = addBlock(doc, 'KYRIO_MEROS');
    removeBlock(doc, a);
    expect(readPlan(doc).blocks).toEqual([]);
  });

  it('υλικό: νέα γραμμή ανάμεσα σε δύο, με τη σειρά της οθόνης', () => {
    const doc = seeded();
    const a = addYlikoAfter(doc, null);
    const c = addYlikoAfter(doc, a);
    updateYliko(doc, a, { label: 'Σπάγκος' });
    updateYliko(doc, c, { label: 'Χάρτες' });
    const b = addYlikoAfter(doc, a);
    updateYliko(doc, b, { label: 'Μαρκαδόροι', qty: 0, packed: true });

    expect(readPlan(doc).yliko.map((y) => [y.label, y.qty, y.packed])).toEqual([
      ['Σπάγκος', 1, false],
      ['Μαρκαδόροι', 1, true],
      ['Χάρτες', 1, false],
    ]);
  });

  it('στελέχη: δύο που τσεκάρουν μαζί διαφορετικά άτομα δεν ακυρώνουν ο ένας τον άλλον', () => {
    const maria = seeded();
    const sofia = new Doc();
    sync(sofia, maria);
    setStelexos(maria, 'u-1', true);
    setStelexos(sofia, 'u-2', true);
    sync(maria, sofia);
    expect(readPlan(maria).stelexi).toEqual(['u-1', 'u-2']);

    setStelexos(sofia, 'u-1', false);
    sync(maria, sofia);
    expect(readPlan(maria).stelexi).toEqual(['u-2']);
  });

  it('πεδίο αριθμού που αδειάζει όσο γράφεται δεν γράφεται (αλλιώς θα γινόταν αμέσως 1)', () => {
    expect(typedNumber('')).toBeNull();
    expect(typedNumber(null)).toBeNull();
    expect(typedNumber('-')).toBeNull();
    expect(typedNumber('15')).toBe(15);
    expect(typedNumber(7)).toBe(7);
  });
});
