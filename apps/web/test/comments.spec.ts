import { describe, expect, it } from 'vitest';
import { Doc, UndoManager, applyUpdate, encodeStateAsUpdate } from 'yjs';
import { anchorOf, findQuote, mentionLabel, mentionQuery, mentionedIn, rangeOf, splitMentions } from '../src/lib/comments';

function textDoc(value: string) {
  const doc = new Doc();
  const text = doc.getText('description');
  text.insert(0, value);
  return { doc, text };
}

const MARIA = { id: 'u-maria', firstName: 'Μαρία', lastName: 'Παππά' };
const SOFIA = { id: 'u-sofia', firstName: 'Σοφία', lastName: 'Κωνσταντίνου' };

describe('η φράση ενός σχολίου', () => {
  it('μένει πάνω στη φράση όσο αλλάζει το κείμενο γύρω της', () => {
    const { doc, text } = textDoc('Ανεβαίνουμε από το μονοπάτι του ποταμού.');
    const from = text.toString().indexOf('μονοπάτι');
    const anchor = anchorOf(text, from, from + 'μονοπάτι'.length);

    text.insert(0, 'Πρωί: ');
    const range = rangeOf(doc, text, anchor)!;
    expect(text.toString().slice(range.from, range.to)).toBe('μονοπάτι');
  });

  it('ό,τι γράφεται ακριβώς πριν ή μετά τη φράση δεν μπαίνει μέσα της· ό,τι γράφεται μέσα, μπαίνει', () => {
    const { doc, text } = textDoc('το μονοπάτι εδώ');
    const anchor = anchorOf(text, 3, 11);

    text.insert(11, 'Χ');
    text.insert(3, 'Ψ');
    text.insert(6, 'ω');
    const range = rangeOf(doc, text, anchor)!;
    expect(text.toString().slice(range.from, range.to)).toBe('μοωνοπάτι');
  });

  it('η φράση σβήστηκε: δεν υπάρχει πια θέση', () => {
    const { doc, text } = textDoc('το μονοπάτι εδώ');
    const anchor = anchorOf(text, 3, 11);
    text.delete(2, 10);
    expect(rangeOf(doc, text, anchor)).toBeNull();
  });

  it('η φράση σβήστηκε και ξαναγράφτηκε στη θέση της (αναίρεση): το σχόλιο τη βρίσκει — σε κάθε συσκευή', () => {
    const { doc, text } = textDoc('Ξεκινάμε με το τραγούδι της ενωμοτίας και μετά');
    const from = text.toString().indexOf('το τραγούδι');
    const anchor = anchorOf(text, from, from + 'το τραγούδι της ενωμοτίας'.length);
    const undo = new UndoManager(text, { captureTimeout: 0 });

    text.delete(from, 'το τραγούδι της ενωμοτίας '.length);
    expect(rangeOf(doc, text, anchor, 'το τραγούδι της ενωμοτίας')).toBeNull();
    undo.undo();

    const other = new Doc();
    applyUpdate(other, encodeStateAsUpdate(doc));
    for (const [d, t] of [[doc, text], [other, other.getText('description')]] as const) {
      const range = rangeOf(d, t, anchor, 'το τραγούδι της ενωμοτίας')!;
      expect(t.toString().slice(range.from, range.to)).toBe('το τραγούδι της ενωμοτίας');
    }
  });

  it('η φράση σβήστηκε — τα ίδια λόγια αλλού στο κείμενο δεν είναι αυτή', () => {
    const { doc, text } = textDoc('Η φωτιά ανάβει νωρίς. Μετά: γύρω από τη φωτιά.');
    const anchor = anchorOf(text, 2, 7);
    text.delete(0, 'Η φωτιά ανάβει νωρίς. '.length);
    expect(rangeOf(doc, text, anchor, 'φωτιά')).toBeNull();
  });

  it('φράση άλλου κειμένου ή άλλου εγγράφου: καμία θέση', () => {
    const { doc, text } = textDoc('το μονοπάτι εδώ');
    const anchor = anchorOf(text, 3, 11);
    const other = doc.getText('recipe');
    other.insert(0, 'κάτι άλλο εντελώς');
    expect(rangeOf(doc, other, anchor)).toBeNull();
    expect(rangeOf(textDoc('το μονοπάτι εδώ').doc, textDoc('').text, anchor)).toBeNull();
    expect(rangeOf(doc, text, { start: 'όχι base64', end: '!!' })).toBeNull();
  });

  it('απόσπασμα από την προβολή: βρίσκεται στο κείμενο, και με άλλα κενά', () => {
    expect(findQuote('Ανεβαίνουμε από το\nμονοπάτι του ποταμού', 'το μονοπάτι')).toEqual({ from: 16, to: 27 });
    expect(findQuote('**Έντονο** κείμενο', 'Έντονο κείμενο')).toBeNull();
    expect(findQuote('κάτι', '  ')).toBeNull();
  });
});

describe('@αναφορές', () => {
  it('γράφεται με ολόκληρο το όνομα, και μετρά όσο μένει στο κείμενο', () => {
    expect(mentionLabel(MARIA)).toBe('@Μαρία Παππά');
    expect(mentionedIn('@Μαρία Παππά το βλέπεις; και η @Σοφία', [MARIA, SOFIA])).toEqual(['u-maria']);
  });

  it('το «@…» πριν από τον κέρσορα ανοίγει τη λίστα — όχι μέσα σε λέξη ή email', () => {
    expect(mentionQuery('Ρώτα την @Μαρ', 13)).toEqual({ query: 'Μαρ', from: 9 });
    expect(mentionQuery('@', 1)).toEqual({ query: '', from: 0 });
    expect(mentionQuery('mail@example', 12)).toBeNull();
    expect(mentionQuery('Ρώτα την @Μαρία και', 19)).toBeNull();
  });

  it('το κείμενο σε κομμάτια, με τις αναφορές χωριστά (για επισήμανση)', () => {
    expect(splitMentions('Δες @Μαρία Παππά: εντάξει', [MARIA])).toEqual([
      { text: 'Δες ', mention: false },
      { text: '@Μαρία Παππά', mention: true },
      { text: ': εντάξει', mention: false },
    ]);
    expect(splitMentions('χωρίς', [])).toEqual([{ text: 'χωρίς', mention: false }]);
  });
});
