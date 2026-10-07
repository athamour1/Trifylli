import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib';

/**
 * Συμπλήρωση των ΕΠΙΣΗΜΩΝ εντύπων του Σ.Ε.Ο. πάνω στα πρωτότυπα PDF.
 *
 * Δεν ξαναφτιάχνουμε το έντυπο: ανοίγουμε το πρωτότυπο (`assets/forms`) και
 * γράφουμε τις τιμές στις θέσεις των γραμμών/κουτιών, βάζουμε τελεία στους
 * κύκλους Ναι/Όχι και κολλάμε την εικόνα της υπογραφής πάνω στη γραμμή της.
 * Οι συντεταγμένες είναι σε points από την ΠΑΝΩ αριστερή γωνία (όπως τα δίνει
 * το `pdftotext -bbox`)· το pdf-lib μετρά από κάτω, η μετατροπή γίνεται εδώ.
 *
 * Τα πρωτότυπα έχουν τυπωμένα παραδείγματα («Μεταμόρφωση Κοζάνης», «17 Ιουλίου»)·
 * αυτά σβήνονται με λευκό ορθογώνιο πριν γραφτεί η δική μας τιμή.
 */

export type FormTemplate = 'dilosi' | 'ygeia-paidi' | 'ygeia-stelexos';

const TEMPLATE_FILE: Record<FormTemplate, string> = {
  dilosi: 'dilosi-symmetoxis.pdf',
  'ygeia-paidi': 'pistopoiitiko-ygeias.pdf',
  'ygeia-stelexos': 'pistopoiitiko-ygeias-stelexous.pdf',
};

/** Ό,τι χρειάζεται για να γεμίσει ένα έντυπο — καθαρά δεδομένα, χωρίς Prisma. */
export interface FilledFormInput {
  template: FormTemplate;
  /** Στοιχεία της δράσης (Μέρος 1 — τα βάζει ο αρχηγός). */
  drasi: { title: string; location: string | null; dateStart: Date; dateEnd: Date; topiko: string; region: string | null; firstAid: string | null; kladosLabel: string | null };
  participant: { firstName: string; lastName: string; birthDate: Date | null };
  answers: Record<string, unknown>;
  signerName: string | null;
  submittedAt: Date | null;
  /** Μέχρι πότε ζητήθηκε να κατατεθεί (για το κουτί στο τέλος του πιστοποιητικού). */
  dueAt: Date | null;
  signaturePng: Uint8Array | null;
}

const ASSETS_DIR = path.resolve(__dirname, '../../../assets');
const INK = rgb(0.1, 0.1, 0.4);
const BLACK = rgb(0, 0, 0);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** Μία τιμή σε μία γραμμή: x, baseline από πάνω, μέγιστο πλάτος. */
interface Slot {
  page: number;
  x: number;
  y: number;
  w: number;
  size?: number;
}
/** Πολύγραμμο κουτί. */
interface Box {
  page: number;
  x: number;
  y: number;
  w: number;
  lines: number;
  size?: number;
}
/** Κέντρο κύκλου Ναι/Όχι. */
interface Dot {
  page: number;
  x: number;
  y: number;
}

/** Μία φορά: τα πρωτότυπα και οι γραμματοσειρές διαβάζονται από τον δίσκο και κρατιούνται. */
const cache = new Map<string, Promise<Uint8Array>>();
function asset(rel: string): Promise<Uint8Array> {
  let p = cache.get(rel);
  if (!p) {
    p = readFile(path.join(ASSETS_DIR, rel)).then((b) => new Uint8Array(b));
    cache.set(rel, p);
  }
  return p;
}

export async function renderFilledForm(input: FilledFormInput): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await asset(`forms/${TEMPLATE_FILE[input.template]}`));
  doc.registerFontkit(fontkit);
  const fonts: Fonts = {
    regular: await doc.embedFont(await asset('fonts/LiberationSans-Regular.ttf'), { subset: true }),
    bold: await doc.embedFont(await asset('fonts/LiberationSans-Bold.ttf'), { subset: true }),
  };
  const pages = doc.getPages();
  const writer = new Writer(pages, fonts);

  if (input.template === 'dilosi') fillDilosi(writer, input);
  else fillYgeia(writer, input, input.template === 'ygeia-paidi');

  if (input.signaturePng) {
    const img = await doc.embedPng(input.signaturePng);
    const spot = SIGNATURE_SPOT[input.template];
    // Χωράει σε κουτί w×h, κρατώντας τις αναλογίες· κάθεται πάνω στη γραμμή της υπογραφής.
    const scale = Math.min(spot.w / img.width, spot.h / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const page = pages[spot.page]!;
    page.drawImage(img, { x: spot.x, y: page.getHeight() - spot.y, width: w, height: h });
  }

  doc.setTitle(input.template === 'dilosi' ? 'Δήλωση Συμμετοχής' : 'Πιστοποιητικό Υγείας');
  doc.setProducer('Trifylli');
  return doc.save();
}

/** Συγχώνευση πολλών συμπληρωμένων εντύπων σε ένα αρχείο (η λήψη «όλα»). */
export async function mergePdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const part of parts) {
    const src = await PDFDocument.load(part);
    const copied = await out.copyPages(src, src.getPageIndices());
    for (const p of copied) out.addPage(p);
  }
  out.setProducer('Trifylli');
  return out.save();
}

// ───────────────────────── Γραφή πάνω στη σελίδα ─────────────────────────

class Writer {
  constructor(
    private readonly pages: PDFPage[],
    private readonly fonts: Fonts,
  ) {}

  private page(i: number): PDFPage {
    const p = this.pages[i];
    if (!p) throw new Error(`Το πρωτότυπο δεν έχει σελίδα ${i + 1}.`);
    return p;
  }

  /** Λευκό ορθογώνιο πάνω από τυπωμένο παράδειγμα του πρωτοτύπου. */
  erase(page: number, x: number, yTop: number, w: number, h: number): void {
    const p = this.page(page);
    p.drawRectangle({ x, y: p.getHeight() - yTop - h, width: w, height: h, color: rgb(1, 1, 1) });
  }

  /** Μία γραμμή· αν δεν χωρά, μικραίνει η γραμματοσειρά μέχρι 6pt και μετά κόβεται με «…». */
  text(slot: Slot, value: string | null | undefined, opts: { bold?: boolean } = {}): void {
    const v = (value ?? '').replace(/\s+/g, ' ').trim();
    if (!v) return;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    let size = slot.size ?? 10;
    let s = v;
    while (font.widthOfTextAtSize(s, size) > slot.w && size > 6) size -= 0.5;
    while (font.widthOfTextAtSize(s, size) > slot.w && s.length > 1) s = `${s.slice(0, -2)}…`;
    const p = this.page(slot.page);
    // Λίγο πάνω από τη γραμμή του εντύπου, όχι πάνω της.
    p.drawText(s, { x: slot.x, y: p.getHeight() - slot.y + 2.5, size, font, color: INK });
  }

  /** Πολλές γραμμές με αναδίπλωση· ό,τι περισσεύει από τις διαθέσιμες γραμμές κόβεται με «…». */
  box(box: Box, value: string | null | undefined): void {
    const v = (value ?? '').trim();
    if (!v) return;
    const size = box.size ?? 9;
    const font = this.fonts.regular;
    const lineHeight = size * 1.25;
    const lines: string[] = [];
    for (const para of v.split(/\r?\n/)) {
      let cur = '';
      for (const word of para.split(/\s+/)) {
        const next = cur ? `${cur} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= box.w) cur = next;
        else {
          if (cur) lines.push(cur);
          cur = word;
        }
      }
      lines.push(cur);
    }
    const shown = lines.slice(0, box.lines);
    if (lines.length > box.lines) shown[box.lines - 1] = `${shown[box.lines - 1]!.slice(0, -1)}…`;
    const p = this.page(box.page);
    shown.forEach((line, i) => p.drawText(line, { x: box.x, y: p.getHeight() - box.y - i * lineHeight, size, font, color: INK }));
  }

  /** Τελεία μέσα σε κύκλο Ναι/Όχι. */
  dot(d: Dot): void {
    const p = this.page(d.page);
    p.drawCircle({ x: d.x, y: p.getHeight() - d.y, size: 2.6, color: BLACK });
  }

  /** Χ μέσα σε τετράγωνο ☐. */
  cross(page: number, cx: number, cy: number, half = 3.5): void {
    const p = this.page(page);
    const y = p.getHeight() - cy;
    p.drawLine({ start: { x: cx - half, y: y - half }, end: { x: cx + half, y: y + half }, thickness: 1.4, color: BLACK });
    p.drawLine({ start: { x: cx - half, y: y + half }, end: { x: cx + half, y: y - half }, thickness: 1.4, color: BLACK });
  }
}

// ───────────────────────── Βοηθητικά ─────────────────────────

const MONTHS_GEN = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'];
const TZ = 'Europe/Athens';

function parts(d: Date): { day: number; month: number; year: number } {
  const f = new Intl.DateTimeFormat('el-GR', { timeZone: TZ, day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(d);
  const get = (t: string) => Number(f.find((x) => x.type === t)?.value ?? 0);
  return { day: get('day'), month: get('month'), year: get('year') };
}
/** «17 Ιουλίου» — όπως γράφονται οι ημερομηνίες στα έντυπα. */
function dayMonth(d: Date): string {
  const p = parts(d);
  return `${p.day} ${MONTHS_GEN[p.month - 1]}`;
}
/** «από 17 μέχρι 26 Ιουλίου 2026» ή «από 28 Ιουνίου μέχρι 3 Ιουλίου 2026». */
function fromTo(a: Date, b: Date): string {
  const pa = parts(a);
  const pb = parts(b);
  if (pa.year === pb.year && pa.month === pb.month) return pa.day === pb.day ? `στις ${pa.day} ${MONTHS_GEN[pa.month - 1]} ${pa.year}` : `από ${pa.day} μέχρι ${pb.day} ${MONTHS_GEN[pb.month - 1]} ${pb.year}`;
  return `από ${dayMonth(a)}${pa.year !== pb.year ? ` ${pa.year}` : ''} μέχρι ${dayMonth(b)} ${pb.year}`;
}
function numeric(d: Date | null): string {
  if (!d) return '';
  const p = parts(d);
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${p.year}`;
}
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const yes = (v: unknown): boolean | null => (v === true ? true : v === false ? false : null);

// ───────────────────────── Δήλωση Συμμετοχής (612×792) ─────────────────────────

function fillDilosi(w: Writer, input: FilledFormInput): void {
  const a = input.answers;
  w.text({ page: 0, x: 150, y: 173, w: 290 }, input.drasi.region);
  w.text({ page: 0, x: 160, y: 202, w: 280 }, input.drasi.topiko);
  w.text({ page: 0, x: 130, y: 231, w: 150 }, input.drasi.kladosLabel);
  // Ο/Η κάτωθι υπογεγραμμένος/η ______ γονέας/κηδεμόνας της/του
  w.text({ page: 0, x: 224, y: 289, w: 160 }, input.signerName);
  // ______ δηλώνω υπεύθυνα…
  w.text({ page: 0, x: 68, y: 318, w: 160 }, `${input.participant.firstName} ${input.participant.lastName}`);
  // «Μεταμόρφωση Κοζάνης από 17 μέχρι 26 Ιουλίου 2026.» → η δική μας πρόταση.
  w.erase(0, 63, 341, 275, 17);
  w.text({ page: 0, x: 65, y: 356, w: 480, size: 11 }, `${input.drasi.location ?? input.drasi.title} ${fromTo(input.drasi.dateStart, input.drasi.dateEnd)}.`);
  const swim = yes(a.swim);
  if (swim === true) w.cross(0, 141, 381);
  if (swim === false) w.cross(0, 342, 381);
  // Τηλέφωνα επικοινωνίας
  w.text({ page: 0, x: 182, y: 495, w: 120 }, str(a.contact1Name));
  w.text({ page: 0, x: 134, y: 536, w: 160 }, str(a.contact1Mobile));
  w.text({ page: 0, x: 126, y: 569, w: 168 }, str(a.contact1Home));
  w.text({ page: 0, x: 172, y: 597, w: 122 }, str(a.contact1Work));
  w.text({ page: 0, x: 414, y: 495, w: 118 }, str(a.contact2Name));
  w.text({ page: 0, x: 352, y: 541, w: 180 }, str(a.contact2Mobile));
  w.text({ page: 0, x: 343, y: 569, w: 189 }, str(a.contact2Home));
  w.text({ page: 0, x: 391, y: 597, w: 141 }, str(a.contact2Work));
  // Ημερομηνία δήλωσης · ονοματεπώνυμο & υπογραφή (η εικόνα μπαίνει δεξιά του ονόματος)
  w.text({ page: 0, x: 90, y: 672, w: 150 }, numeric(input.submittedAt));
  w.text({ page: 0, x: 320, y: 672, w: 160 }, input.signerName);
}

// ───────────────────────── Πιστοποιητικό Υγείας (595.32×841.92) ─────────────────────────

function fillYgeia(w: Writer, input: FilledFormInput, minor: boolean): void {
  const a = input.answers;
  const P = input.participant;

  // ── Μέρος 1: σβήνουμε τα τυπωμένα παραδείγματα και γράφουμε τα δικά μας ──
  w.erase(0, 222, 191, 120, 16);
  w.erase(0, 206, 211, 56, 16);
  w.erase(0, 420, 211, 56, 16);
  w.erase(0, 346, 231, 118, 16);
  w.text({ page: 0, x: 226, y: 204, w: 270 }, input.drasi.title);
  w.text({ page: 0, x: 208, y: 224, w: 110 }, dayMonth(input.drasi.dateStart));
  w.text({ page: 0, x: 423, y: 224, w: 100 }, dayMonth(input.drasi.dateEnd));
  w.text({ page: 0, x: 350, y: 244, w: 170 }, input.drasi.firstAid);

  // ── Προσωπικά στοιχεία ──
  w.text({ page: 0, x: 130, y: 326, w: 160 }, P.lastName);
  w.text({ page: 0, x: 443, y: 326, w: 80 }, str(a.guideId));
  w.text({ page: 0, x: 126, y: 346, w: 164 }, P.firstName);
  w.text({ page: 0, x: 358, y: 346, w: 160 }, str(a.amka));
  w.text({ page: 0, x: 156, y: 367, w: 134 }, numeric(P.birthDate));
  w.text({ page: 0, x: 398, y: 367, w: 120 }, str(a.bloodType) === 'Δεν γνωρίζω' ? '' : str(a.bloodType));
  w.box({ page: 0, x: 98, y: 410, w: 420, lines: 2 }, str(a.address));
  const tet = yes(a.tetanus);
  if (tet === true) w.dot({ page: 0, x: 298, y: 464 });
  if (tet === false) w.dot({ page: 0, x: 342, y: 464 });
  w.text({ page: 0, x: 342, y: 489, w: 170 }, str(a.tetanusDate));
  w.text({ page: 0, x: 243, y: 510, w: 270 }, str(a.doctorName));
  w.text({ page: 0, x: 260, y: 530, w: 250 }, str(a.doctorPhone));

  // ── Γενικές πληροφορίες: κύκλοι Όχι/Ναι + κουτί «αναλυτικά» ──
  const yn = (page: number, yNo: number, yYes: number, value: unknown) => {
    const v = yes(value);
    if (v === false) w.dot({ page, x: 96, y: yNo });
    if (v === true) w.dot({ page, x: 96, y: yYes });
  };
  yn(0, 606, 625, a.allergies);
  w.box({ page: 0, x: 208, y: 636, w: 320, lines: 3 }, yes(a.allergies) ? str(a.allergiesDetails) : '');
  yn(0, 717, 736, a.conditions);
  w.box({ page: 0, x: 208, y: 748, w: 320, lines: 3 }, yes(a.conditions) ? str(a.conditionsDetails) : '');

  // Σελίδα 2 — οι δύο εκδοχές διαφέρουν κατά 1pt στις πρώτες ερωτήσεις, περισσότερο στο τέλος.
  yn(1, minor ? 182 : 183, minor ? 201 : 202, a.medications);
  w.box({ page: 1, x: 208, y: 213, w: 320, lines: 3 }, yes(a.medications) ? str(a.medicationsDetails) : '');
  if (yes(a.medications)) yn(1, minor ? 281 : 282, minor ? 300 : 301, a.selfMedication);
  yn(1, 378, 397, a.diet);
  w.box({ page: 1, x: 208, y: 409, w: 320, lines: 3 }, yes(a.diet) ? str(a.dietDetails) : '');
  yn(1, minor ? 502 : 490, minor ? 521 : 509, a.extraInfo);
  w.box({ page: 1, x: 208, y: minor ? 521 : 509, w: 320, lines: 3 }, yes(a.extraInfo) ? str(a.extraInfoDetails) : '');

  // Λίστα ΝΑΙ/ΟΧΙ: αριστερή στήλη (ΝΑΙ x≈183, ΟΧΙ x≈216), δεξιά (ΝΑΙ x≈350, ΟΧΙ x≈383).
  const rows = minor ? [610, 622, 633, 644] : [598, 610, 622, 633];
  const check = (key: string, col: 'L' | 'R', row: number) => {
    const v = yes(a[key]);
    if (v === null) return;
    const x = col === 'L' ? (v ? 183 : 216) : v ? 350 : 383;
    w.dot({ page: 1, x, y: rows[row]! });
  };
  check('epilepsy', 'L', 0);
  check('panic', 'L', 1);
  check('claustrophobia', 'L', 2);
  check('nosebleeds', 'L', 3);
  check('sleepwalking', 'R', 0);
  check('enuresis', 'R', 1);
  check('lice', 'R', 2);
  if (minor) check('enzymes', 'R', 3);

  if (minor) {
    // Σελίδα 3 του εντύπου γονέα
    w.box({ page: 2, x: 97, y: 171, w: 430, lines: 3 }, str(a.addendum));
    w.text({ page: 2, x: 170, y: 335, w: 140 }, str(a.emergency1Name));
    w.text({ page: 2, x: 150, y: 357, w: 160 }, str(a.emergency1Phone1));
    w.text({ page: 2, x: 150, y: 382, w: 160 }, str(a.emergency1Phone2));
    w.text({ page: 2, x: 90, y: 421, w: 220, size: 9 }, str(a.emergency1Relation));
    w.text({ page: 2, x: 412, y: 335, w: 110 }, str(a.emergency2Name));
    w.text({ page: 2, x: 395, y: 357, w: 130 }, str(a.emergency2Phone1));
    w.text({ page: 2, x: 395, y: 382, w: 130 }, str(a.emergency2Phone2));
    w.text({ page: 2, x: 335, y: 421, w: 190, size: 9 }, str(a.emergency2Relation));
    w.text({ page: 2, x: 408, y: 578, w: 110 }, numeric(input.submittedAt));
    w.text({ page: 2, x: 248, y: 616, w: 180 }, input.signerName);
    w.text({ page: 2, x: 97, y: 668, w: 420 }, numeric(input.dueAt));
  } else {
    // Έντυπο στελέχους: το «Θα ήθελα να προσθέσω» και το 1ο άτομο είναι στο τέλος της σελίδας 2.
    w.box({ page: 1, x: 97, y: 699, w: 430, lines: 2 }, str(a.addendum));
    w.text({ page: 1, x: 395, y: 745, w: 130 }, str(a.emergency1Name));
    w.text({ page: 1, x: 375, y: 767, w: 150 }, str(a.emergency1Phone1));
    w.text({ page: 2, x: 150, y: 142, w: 150 }, str(a.emergency1Phone2));
    w.text({ page: 2, x: 238, y: 167, w: 75, size: 8 }, str(a.emergency1Relation));
    w.text({ page: 2, x: 395, y: 164, w: 130 }, str(a.emergency2Name));
    w.text({ page: 2, x: 395, y: 189, w: 130 }, str(a.emergency2Phone1));
    w.text({ page: 2, x: 395, y: 214, w: 130 }, str(a.emergency2Phone2));
    w.text({ page: 2, x: 335, y: 252, w: 190, size: 9 }, str(a.emergency2Relation));
    w.text({ page: 2, x: 408, y: 408, w: 110 }, numeric(input.submittedAt));
    w.text({ page: 2, x: 170, y: 445, w: 180 }, input.signerName);
    w.text({ page: 2, x: 97, y: 516, w: 420 }, numeric(input.dueAt));
  }
}

/** Πού κάθεται η εικόνα της υπογραφής: κουτί (x, κάτω άκρο από πάνω, w, h) στη γραμμή «Υπογραφή». */
const SIGNATURE_SPOT: Record<FormTemplate, { page: number; x: number; y: number; w: number; h: number }> = {
  dilosi: { page: 0, x: 330, y: 712, w: 120, h: 36 },
  'ygeia-paidi': { page: 2, x: 220, y: 578, w: 110, h: 34 },
  'ygeia-stelexos': { page: 2, x: 192, y: 408, w: 110, h: 34 },
};
