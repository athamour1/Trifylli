import { describe, expect, it } from 'vitest';
import { pollCounts, pollResultText } from './poll-result';

describe('ψηφοφορίες συμβουλίου', () => {
  it('μέτρημα ανά επιλογή — ό,τι είναι εκτός επιλογών δεν μετράει', () => {
    expect(pollCounts(3, [0, 0, 1, 2, 7, -1])).toEqual([2, 1, 1]);
  });

  it('επώνυμη: στα πρακτικά τα σύνολα και ποιος ψήφισε τι', () => {
    const text = pollResultText(
      { question: 'Εκδρομή στις 25/10;', options: ['Ναι', 'Όχι', 'Αποχή'], secret: false, closedAt: new Date('2026-10-16T09:00:00Z') },
      [2, 1, 0],
      [
        { name: 'Μαρία Π.', voted: true, choice: 0 },
        { name: 'Σοφία Κ.', voted: true, choice: 0 },
        { name: 'Ελένη Δ.', voted: true, choice: 1 },
        { name: 'Νίκος Γ.', voted: false, choice: null },
      ],
    );
    expect(text).toBe(
      ['**Ψηφοφορία:** Εκδρομή στις 25/10;', 'Ναι 2 · Όχι 1 · Αποχή 0 — ψήφισαν 3 από 4 (16/10/2026)', '- Ναι: Μαρία Π., Σοφία Κ.', '- Όχι: Ελένη Δ.'].join('\n'),
    );
  });

  it('μυστική: μόνο τα σύνολα', () => {
    const text = pollResultText(
      { question: 'Νέος ταμίας: Σοφία;', options: ['Ναι', 'Όχι', 'Αποχή'], secret: true, closedAt: new Date('2026-10-16T09:00:00Z') },
      [3, 0, 1],
      [
        { name: 'Μαρία Π.', voted: true, choice: null },
        { name: 'Σοφία Κ.', voted: true, choice: null },
      ],
    );
    expect(text).toBe(['**Ψηφοφορία (μυστική):** Νέος ταμίας: Σοφία;', 'Ναι 3 · Όχι 0 · Αποχή 1 — ψήφισαν 2 από 2 (16/10/2026)'].join('\n'));
  });
});
