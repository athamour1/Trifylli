import { describe, expect, it } from 'vitest';
import { thumbBox } from '../src/components/segmented-thumb';

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });

describe('thumbBox', () => {
  it('χωρίς transform: η θέση του κουμπιού μέσα στη ράγα', () => {
    expect(thumbBox(rect(110, 53, 89, 32), rect(100, 50, 200, 38), { width: 200, height: 38 }, { left: 0, top: 0 })).toEqual({
      x: 10,
      y: 3,
      w: 89,
      h: 32,
    });
  });

  it('μέσα σε διάλογο που ανοίγει με scale: μέγεθος διάταξης, όχι το «μικρό» της οθόνης', () => {
    // Ράγα 200×38 που φαίνεται στο 90%: όλα τα μεγέθη στην οθόνη × 0,9.
    const box = thumbBox(rect(109, 52.7, 80.1, 28.8), rect(100, 50, 180, 34.2), { width: 200, height: 38 }, { left: 0, top: 0 });
    expect(box.x).toBeCloseTo(10);
    expect(box.y).toBeCloseTo(3);
    expect(box.w).toBeCloseTo(89);
    expect(box.h).toBeCloseTo(32);
  });

  it('ράγα που κυλά: μετράει και η κύλιση', () => {
    expect(thumbBox(rect(110, 53, 89, 32), rect(100, 50, 200, 38), { width: 200, height: 38 }, { left: 40, top: 0 }).x).toBe(50);
  });
});
