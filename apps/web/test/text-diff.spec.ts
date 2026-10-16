import { describe, expect, it } from 'vitest';
import { diffText, hasChanges } from '../src/lib/text-diff';

const plain = (lines: ReturnType<typeof diffText>) =>
  lines.map((line) => `${line.kind === 'same' ? ' ' : line.kind === 'add' ? '+' : '-'}${line.segments.map((s) => (s.kind === 'same' ? s.text : `[${s.text}]`)).join('')}`);

describe('σύγκριση εκδόσεων', () => {
  it('γραμμές που μπήκαν και βγήκαν, οι ίδιες μένουν ως έχουν', () => {
    const lines = diffText('Άνοιγμα\nΤραγούδι\nΚλείσιμο', 'Άνοιγμα\nΠαιχνίδι\nΤραγούδι');
    expect(plain(lines)).toEqual([' Άνοιγμα', '+[Παιχνίδι]', ' Τραγούδι', '-[Κλείσιμο]']);
  });

  it('γραμμή που άλλαξε: φαίνονται μόνο οι λέξεις που άλλαξαν', () => {
    const lines = diffText('Ξεκινάμε στις 10 από το ρέμα', 'Ξεκινάμε στις 11 από το ρέμα');
    expect(plain(lines)).toEqual(['-Ξεκινάμε στις [10] από το ρέμα', '+Ξεκινάμε στις [11] από το ρέμα']);
  });

  it('ίδιο κείμενο: καμία αλλαγή· άδειο → κείμενο: όλα νέα', () => {
    expect(hasChanges(diffText('α\nβ', 'α\nβ'))).toBe(false);
    expect(plain(diffText('', 'Νέο'))).toEqual(['+[Νέο]']);
  });

  it('πολύ μεγάλα κείμενα: δεν κολλάει — η κοινή αρχή και το κοινό τέλος μένουν ίδια', () => {
    const before = Array.from({ length: 4000 }, (_, i) => `γραμμή ${i}`).join('\n');
    const after = before.replace('γραμμή 2000', 'αλλαγή');
    const lines = diffText(before, after);
    expect(lines.filter((line) => line.kind !== 'same')).toHaveLength(2);
  });
});
