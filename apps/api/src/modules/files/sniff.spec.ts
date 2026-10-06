import { describe, expect, it } from 'vitest';
import { sniffMime } from './sniff';

const b = (...xs: (number | string)[]): Buffer =>
  Buffer.concat(xs.map((x) => (typeof x === 'string' ? Buffer.from(x, 'latin1') : Buffer.from([x]))));

describe('sniffMime', () => {
  it('αναγνωρίζει τους επιτρεπτούς τύπους από τα πρώτα bytes', () => {
    expect(sniffMime(b(0xff, 0xd8, 0xff, 0xe0, 'JFIF'))).toBe('image/jpeg');
    expect(sniffMime(b(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffMime(b('GIF89a'))).toBe('image/gif');
    expect(sniffMime(b('RIFF', 0, 0, 0, 0, 'WEBPVP8 '))).toBe('image/webp');
    expect(sniffMime(b('%PDF-1.7'))).toBe('application/pdf');
    expect(sniffMime(b(0, 0, 0, 0x18, 'ftypheic', 0, 0, 0, 0, 'mif1heic'))).toBe('image/heic');
    expect(sniffMime(b(0, 0, 0, 0x18, 'ftypmif1', 0, 0, 0, 0, 'mif1heic'))).toBe('image/heic');
  });

  it('απορρίπτει ό,τι δεν είναι εικόνα ή PDF — ακόμη κι αν ο client λέει αλλιώς', () => {
    expect(sniffMime(b('<!doctype html><script>'))).toBeNull();
    expect(sniffMime(b('MZ', 0x90, 0x00))).toBeNull(); // Windows EXE
    expect(sniffMime(b('PK', 0x03, 0x04))).toBeNull(); // ZIP/Office
    expect(sniffMime(Buffer.alloc(0))).toBeNull();
    expect(sniffMime(b(0, 0, 0, 0x18, 'ftypmp42'))).toBeNull(); // MP4 video
  });
});
