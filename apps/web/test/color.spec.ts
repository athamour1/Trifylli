import { describe, expect, it } from 'vitest';
import { inkOnWhite, readableOn, readableOnLarge } from '../src/lib/color';

/** Σχετική φωτεινότητα κατά WCAG — ο ανεξάρτητος κριτής των δύο συναρτήσεων. */
function luminance(hex: string): number {
  // Το `readableOn` απαντά με τριψήφιο `#000`/`#fff`· χωρίς ανάπτυξη ο
  // υπολογισμός θα έβγαζε NaN και το test θα «περνούσε» χωρίς να μετρά τίποτα.
  const value = hex.slice(1);
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value;

  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
};

/** Τα επίσημα χρώματα των κλάδων — η πραγματική είσοδος. */
const KLADOI = ['#00a2b1', '#ffcb06', '#0094da', '#ee1c25'];

describe('χρώματα κλάδων', () => {
  /** Φρουρός: ένα NaN εδώ θα έκανε κάθε σύγκριση παρακάτω να μη μετρά τίποτα. */
  it('ο κριτής του test υπολογίζει πραγματικά', () => {
    expect(luminance('#fff')).toBeCloseTo(1, 5);
    expect(luminance('#000')).toBeCloseTo(0, 5);
    expect(contrast('#000', '#fff')).toBeCloseTo(21, 1);
  });

  it('διαλέγει το χρώμα κειμένου με τη μεγαλύτερη αντίθεση', () => {
    for (const color of KLADOI) {
      const picked = readableOn(color);
      const other = picked === '#000' ? '#fff' : '#000';
      expect(contrast(color, picked)).toBeGreaterThanOrEqual(contrast(color, other));
    }
  });

  it('το κίτρινο θέλει μαύρο κείμενο — εκεί σπάει ένα σταθερό λευκό', () => {
    expect(readableOn('#ffcb06')).toBe('#000');
  });

  it('σε μεγάλη επιφάνεια προτιμά λευκό, αλλά ποτέ κάτω από το 3:1', () => {
    for (const color of KLADOI) {
      const picked = readableOnLarge(color);
      expect(contrast(color, picked)).toBeGreaterThanOrEqual(3);
    }
    // Το κίτρινο είναι ο λόγος που ο κανόνας δεν είναι «πάντα λευκό».
    expect(readableOnLarge('#ffcb06')).toBe('#000');
    expect(readableOnLarge('#ee1c25')).toBe('#fff');
  });

  it('η απόχρωση κειμένου περνά το 4.5:1 πάνω σε λευκό', () => {
    for (const color of KLADOI) {
      expect(contrast(inkOnWhite(color), '#ffffff')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('σκουραίνει όσο χρειάζεται και όχι περισσότερο', () => {
    // Το κόκκινο είναι ήδη σχεδόν αρκετό: δεν πρέπει να καταλήξει μαύρο.
    expect(inkOnWhite('#ee1c25')).not.toBe('#000');
    // Το κίτρινο θέλει πολλή σκούρανση, αλλά παραμένει κίτρινης οικογένειας:
    // το κόκκινο κανάλι μένει το κυρίαρχο.
    const ink = inkOnWhite('#ffcb06');
    const [r, g, b] = [1, 3, 5].map((o) => parseInt(ink.slice(o, o + 2), 16));
    expect(r!).toBeGreaterThan(b!);
    expect(g!).toBeGreaterThan(b!);
  });

  it('αφήνει ανέπαφο ό,τι δεν είναι hex', () => {
    expect(inkOnWhite('primary')).toBe('primary');
    expect(readableOn('var(--q-primary)')).toBe('#fff');
  });
});
