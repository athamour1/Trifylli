/**
 * Αναγνώριση τύπου αρχείου από τα πρώτα bytes — μόνο για τους τύπους που
 * δεχόμαστε.
 *
 * Δικός μας κώδικας αντί για βιβλιοθήκη: η λίστα είναι έξι τύποι, οι
 * «υπογραφές» τους είναι δημόσιες και σταθερές εδώ και δεκαετίες, και μια
 * βιβλιοθήκη που αναγνωρίζει 300 formats είναι 300 parsers επιφάνειας επίθεσης
 * (η `file-type` είχε ήδη advisory την ώρα που γραφόταν αυτό). Ό,τι δεν
 * αναγνωρίζεται απορρίπτεται — δεν «μαντεύουμε».
 */

const ascii = (buf: Buffer, start: number, text: string): boolean =>
  buf.length >= start + text.length && buf.toString('latin1', start, start + text.length) === text;

const bytes = (buf: Buffer, start: number, ...expected: number[]): boolean =>
  buf.length >= start + expected.length && expected.every((b, i) => buf[start + i] === b);

/** Brands του ISO Base Media container που σημαίνουν HEIC/HEIF (ftyp box). */
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];

export function sniffMime(buf: Buffer): string | null {
  if (bytes(buf, 0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (bytes(buf, 0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (ascii(buf, 0, 'GIF87a') || ascii(buf, 0, 'GIF89a')) return 'image/gif';
  if (ascii(buf, 0, 'RIFF') && ascii(buf, 8, 'WEBP')) return 'image/webp';
  if (ascii(buf, 0, '%PDF-')) return 'application/pdf';
  // ISO BMFF: [size:4]["ftyp"][major brand:4][minor:4][compatible brands...]
  if (ascii(buf, 4, 'ftyp')) {
    const major = buf.toString('latin1', 8, 12).toLowerCase();
    if (HEIC_BRANDS.includes(major)) return 'image/heic';
    // Ορισμένα iPhone αρχεία έχουν major `mif1` και το `heic` στα compatible.
    const compat = buf.toString('latin1', 16, Math.min(buf.length, 64)).toLowerCase();
    if (HEIC_BRANDS.some((b) => compat.includes(b))) return 'image/heic';
  }
  return null;
}
