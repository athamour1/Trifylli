import { describe, expect, it } from 'vitest';
import { Doc, Map as YMap, Text as YText, createRelativePositionFromTypeIndex, createAbsolutePositionFromRelativePosition } from 'yjs';
import { setRows, setText } from './collab-restore';

describe('επαναφορά έκδοσης — με τις μικρότερες αλλαγές', () => {
  it('κείμενο: αλλάζει μόνο το κομμάτι που διαφέρει — όποιος γράφει αλλού δεν χάνει τη θέση του', () => {
    const doc = new Doc();
    const text = doc.getText('description');
    text.insert(0, 'Αρχή. Μέση που άλλαξε. Τέλος εδώ.');
    // Κάποιος γράφει στο «Τέλος»: η θέση του πρέπει να μείνει εκεί.
    const caret = createRelativePositionFromTypeIndex(text, text.toString().indexOf('εδώ'));

    setText(text, 'Αρχή. Η παλιά μέση. Τέλος εδώ.');

    expect(text.toString()).toBe('Αρχή. Η παλιά μέση. Τέλος εδώ.');
    const at = createAbsolutePositionFromRelativePosition(caret, doc)!.index;
    expect(text.toString().slice(at)).toBe('εδώ.');
  });

  it('κείμενο με emoji: δεν κόβεται ποτέ στη μέση ενός χαρακτήρα', () => {
    const doc = new Doc();
    const text = doc.getText('description');
    text.insert(0, 'Φωτιά 🔥 και 🎸');
    setText(text, 'Φωτιά 🔥 και 🎺');
    expect(text.toString()).toBe('Φωτιά 🔥 και 🎺');
    setText(text, '');
    expect(text.toString()).toBe('');
  });

  it('λίστα: φεύγουν όσες γραμμές λείπουν, μπαίνουν όσες έλειπαν, αλλάζουν μόνο τα πεδία που διαφέρουν', () => {
    const doc = new Doc();
    const map = doc.getMap<YMap<unknown>>('yliko');
    const keep = new YMap<unknown>();
    keep.set('label', 'Κιθάρα');
    keep.set('qty', 1);
    map.set('a', keep);
    const gone = new YMap<unknown>();
    gone.set('label', 'Σφυρίχτρα');
    map.set('b', gone);

    setRows(map, [
      { id: 'a', label: 'Κιθάρα', qty: 2 },
      { id: 'c', label: 'Φακός', qty: 1 },
    ]);

    expect([...map.keys()].sort()).toEqual(['a', 'c']);
    expect(map.get('a')).toBe(keep);
    expect(keep.get('qty')).toBe(2);
    expect(map.get('c')?.get('label')).toBe('Φακός');
  });

  it('λίστα με κείμενα μέσα (π.χ. η περιγραφή ενός κομματιού): γίνονται Y.Text, όχι απλές τιμές', () => {
    const doc = new Doc();
    const map = doc.getMap<YMap<unknown>>('blocks');
    const block = new YMap<unknown>();
    block.set('title', 'Παιχνίδι');
    block.set('description', new YText('παλιό'));
    map.set('a', block);

    setRows(map, [
      { id: 'a', title: 'Παιχνίδι', description: 'νέο κείμενο' },
      { id: 'b', title: 'Τραγούδι', description: 'στίχοι' },
    ], ['description']);

    expect((block.get('description') as YText).toString()).toBe('νέο κείμενο');
    const added = map.get('b')!.get('description');
    expect(added).toBeInstanceOf(YText);
    expect((added as YText).toString()).toBe('στίχοι');
  });

  it('τιμές-λίστες (π.χ. το υλικό της αποθήκης ενός κομματιού) συγκρίνονται ως τιμές', () => {
    const doc = new Doc();
    const map = doc.getMap<YMap<unknown>>('blocks');
    const block = new YMap<unknown>();
    block.set('yliko', [{ id: 'y', qty: 1 }]);
    map.set('a', block);
    let changes = 0;
    doc.on('update', () => (changes += 1));

    setRows(map, [{ id: 'a', yliko: [{ id: 'y', qty: 1 }] }]);
    expect(changes).toBe(0);
    setRows(map, [{ id: 'a', yliko: [{ id: 'y', qty: 3 }] }]);
    expect(block.get('yliko')).toEqual([{ id: 'y', qty: 3 }]);
  });
});
