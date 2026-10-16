import { describe, expect, it } from 'vitest';
import { PLAN_KEYS } from '@trifylli/shared';
import { Doc, Map as YMap, Text as YText, applyUpdate, encodeStateAsUpdate } from 'yjs';
import { normalizePlan, readPlan, seedPlan, type PlanRows } from './syggentrwsh-plan';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const rows: PlanRows = {
  parts: [
    { section: 'ANOIGMA', notes: 'Προσκλητήριο', durationMin: 10 },
    { section: 'KLEISIMO', notes: '', durationMin: 5 },
  ],
  blocks: [
    {
      id: id(1),
      section: 'KYRIO_MEROS',
      order: 0,
      title: 'Κυνήγι',
      description: 'Κανόνες…',
      durationMin: 30,
      responsibleId: id(50),
      yliko: [{ qty: 2, yliko: { id: id(70), name: 'Σφυρίχτρα' } }],
    },
    { id: id(2), section: 'KYRIO_MEROS', order: 1, title: 'Τραγούδι', description: null, durationMin: 10, responsibleId: null, yliko: [] },
  ],
  yliko: [{ id: id(80), order: 0, label: 'Σπάγκος', qty: 3, packed: false }],
  stelexi: [id(50), id(51)],
};

describe('πρόγραμμα συγκέντρωσης ως κοινό έγγραφο', () => {
  it('γεμίζει από τη βάση και διαβάζεται πίσω όπως ήταν', () => {
    const doc = new Doc();
    seedPlan(doc, rows);
    const plan = readPlan(doc);

    expect(plan.sections.ANOIGMA).toEqual({ notes: 'Προσκλητήριο', durationMin: 10 });
    expect(plan.sections.KYRIO_MEROS).toEqual({ notes: '', durationMin: 0 });
    expect(plan.blocks.map((b) => [b.id, b.title, b.description, b.responsibleId])).toEqual([
      [id(1), 'Κυνήγι', 'Κανόνες…', id(50)],
      [id(2), 'Τραγούδι', '', null],
    ]);
    expect(plan.blocks[0]?.yliko).toEqual([{ id: id(70), name: 'Σφυρίχτρα', qty: 2 }]);
    expect(plan.yliko).toEqual([{ id: id(80), order: 0, label: 'Σπάγκος', qty: 3, packed: false }]);
    expect(plan.stelexi).toEqual([id(50), id(51)]);
  });

  it('δύο που αλλάζουν μαζί — ο ένας τη σειρά, ο άλλος την περιγραφή — δεν χάνουν τίποτα', () => {
    const server = new Doc();
    seedPlan(server, rows);
    const maria = new Doc();
    const sofia = new Doc();
    applyUpdate(maria, encodeStateAsUpdate(server));
    applyUpdate(sofia, encodeStateAsUpdate(server));

    // Η Μαρία ανεβάζει το «Τραγούδι» πάνω από το «Κυνήγι» (αλλάζει μόνο τον αριθμό σειράς)…
    maria.getMap<YMap<unknown>>(PLAN_KEYS.blocks).get(id(2))!.set('order', -1);
    // …και η Σοφία γράφει ταυτόχρονα στην περιγραφή του «Τραγουδιού».
    (sofia.getMap<YMap<unknown>>(PLAN_KEYS.blocks).get(id(2))!.get('description') as YText).insert(0, 'Στίχοι στο φυλλάδιο.');

    applyUpdate(maria, encodeStateAsUpdate(sofia));
    applyUpdate(sofia, encodeStateAsUpdate(maria));

    for (const doc of [maria, sofia]) {
      const plan = readPlan(doc);
      expect(plan.blocks.map((b) => b.title)).toEqual(['Τραγούδι', 'Κυνήγι']);
      expect(plan.blocks[0]?.description).toBe('Στίχοι στο φυλλάδιο.');
    }
  });

  it('κανονικοποίηση: διορθώνει αντί να απορρίπτει', () => {
    const doc = new Doc();
    seedPlan(doc, rows);
    const blocks = doc.getMap<YMap<unknown>>(PLAN_KEYS.blocks);
    blocks.get(id(1))!.set('durationMin', 9000);
    blocks.get(id(2))!.set('durationMin', 'όχι αριθμός');
    blocks.get(id(2))!.set('responsibleId', id(99));
    blocks.get(id(1))!.set('title', `  ${'α'.repeat(250)}  `);
    const stranger = new YMap<unknown>();
    stranger.set('section', 'ΠΟΥΘΕΝΑ');
    blocks.set(id(3), stranger);
    const blank = new YMap<unknown>();
    blank.set('label', '   ');
    doc.getMap<YMap<unknown>>(PLAN_KEYS.yliko).set(id(81), blank);

    const write = normalizePlan(readPlan(doc), { stelexi: new Set([id(50)]), yliko: new Set() });

    expect(write.blocks.map((b) => [b.id, b.order, b.durationMin, b.responsibleId])).toEqual([
      [id(1), 0, 600, id(50)],
      [id(2), 1, 10, null],
    ]);
    expect(write.blocks[0]?.title).toHaveLength(200);
    // Υλικό που δεν υπάρχει στην αποθήκη δεν γράφεται.
    expect(write.blocks[0]?.yliko).toEqual([]);
    // Τα άδεια μέρη δεν γράφονται· οι κενές γραμμές υλικού επίσης.
    expect(write.sections.map((s) => s.section)).toEqual(['ANOIGMA', 'KLEISIMO']);
    expect(write.yliko.map((y) => y.label)).toEqual(['Σπάγκος']);
    // Στελέχη μόνο του κλάδου.
    expect(write.stelexi).toEqual([id(50)]);
  });

  it('η σειρά στη βάση είναι ακέραια ανά μέρος, όποιοι κι αν είναι οι αριθμοί του εγγράφου', () => {
    const doc = new Doc();
    seedPlan(doc, rows);
    doc.getMap<YMap<unknown>>(PLAN_KEYS.blocks).get(id(2))!.set('order', -0.5);

    const write = normalizePlan(readPlan(doc), { stelexi: new Set(), yliko: new Set([id(70)]) });

    expect(write.blocks.map((b) => [b.title, b.order])).toEqual([
      ['Τραγούδι', 0],
      ['Κυνήγι', 1],
    ]);
  });
});
