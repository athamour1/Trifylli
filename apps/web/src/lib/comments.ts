import type { CommentAnchor, CommentPerson } from '@trifylli/shared';
import {
  createAbsolutePositionFromRelativePosition,
  createRelativePositionFromTypeIndex,
  decodeRelativePosition,
  encodeRelativePosition,
  type Doc,
  type Text as YText,
} from 'yjs';

/**
 * Τα σχόλια μέσα στα κείμενα: η φράση ως θέσεις του Yjs που ακολουθούν το
 * κείμενο, και οι @αναφορές (με ολόκληρο το όνομα, όπως γράφονται στο σχόλιο).
 */

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/**
 * Η φράση `[from, to)` ως θέσεις που ακολουθούν το κείμενο: η αρχή δένεται με
 * τον πρώτο της χαρακτήρα και το τέλος με τον τελευταίο, οπότε ό,τι γράφεται
 * ακριβώς πριν ή ακριβώς μετά δεν μπαίνει μέσα της.
 */
export function anchorOf(text: YText, from: number, to: number): CommentAnchor {
  return {
    start: toBase64(encodeRelativePosition(createRelativePositionFromTypeIndex(text, from, 0))),
    end: toBase64(encodeRelativePosition(createRelativePositionFromTypeIndex(text, to, -1))),
  };
}

/**
 * Πού είναι τώρα η φράση — `null` αν σβήστηκε, αν ανήκει σε άλλο κείμενο, ή αν
 * το έγγραφο δεν την ξέρει (άλλη γενιά, ή δεν έχει συγχρονιστεί ακόμα).
 *
 * Φράση που σβήστηκε και ξαναγράφτηκε ίδια **στο ίδιο σημείο** (π.χ. με
 * αναίρεση, που φτιάχνει νέο κείμενο) βρίσκεται από το απόσπασμα (`quote`). Η
 * αναίρεση δεν ακολουθείται μέσω του Yjs: αυτό το ξέρει μόνο η συσκευή που
 * έκανε την αναίρεση, και οι άλλες θα έβλεπαν άλλο πράγμα.
 */
export function rangeOf(doc: Doc, text: YText, anchor: CommentAnchor, quote?: string | null): { from: number; to: number } | null {
  try {
    const start = createAbsolutePositionFromRelativePosition(decodeRelativePosition(fromBase64(anchor.start)), doc, false);
    const end = createAbsolutePositionFromRelativePosition(decodeRelativePosition(fromBase64(anchor.end)), doc, false);
    if (!start || !end || start.type !== text || end.type !== text) return null;
    if (start.index < end.index) return { from: start.index, to: end.index };
    return quote ? quoteAt(text.toString(), quote, start.index) : null;
  } catch {
    return null;
  }
}

/** Το απόσπασμα ξανά, εκεί που ήταν η φράση (ακουμπά το σημείο όπου σβήστηκε) — αλλού δεν μετράει. */
function quoteAt(source: string, quote: string, at: number): { from: number; to: number } | null {
  // Ένα μακρύ απόσπασμα έχει κοπεί με «…»: φτάνει η αρχή του.
  const pattern = quotePattern(quote.replace(/…$/u, ''), 'gu');
  if (!pattern) return null;
  for (const match of source.matchAll(pattern)) {
    const from = match.index;
    const to = from + match[0].length;
    if (from <= at + 1 && to >= at - 1) return { from, to };
  }
  return null;
}

/** Οι λέξεις του αποσπάσματος με οποιαδήποτε κενά ανάμεσα. */
function quotePattern(quote: string, flags: string): RegExp | null {
  const words = quote.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return new RegExp(words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), flags);
}

/**
 * Ένα απόσπασμα που επιλέχθηκε στην προβολή (όχι στο κείμενο Markdown): πού
 * βρίσκεται στο κείμενο — και με άλλα κενά ή αλλαγές γραμμής. Αν η μορφοποίηση
 * το χωρίζει (π.χ. `**έντονα**`), δεν βρίσκεται και το σχόλιο μένει χωρίς φράση.
 */
export function findQuote(source: string, quote: string): { from: number; to: number } | null {
  const match = quotePattern(quote, 'u')?.exec(source);
  return match ? { from: match.index, to: match.index + match[0].length } : null;
}

// ───────────────────────── @αναφορές ─────────────────────────

/** «@Μαρία Παππά» — ολόκληρο το όνομα, για να μη μπερδεύονται δύο «Μαρία Π.». */
export function mentionLabel(person: CommentPerson): string {
  return `@${person.firstName} ${person.lastName}`.trim();
}

/** Ποιοι αναφέρονται στο κείμενο — όποιο όνομα σβήστηκε, φεύγει και από τις αναφορές. */
export function mentionedIn(body: string, people: readonly CommentPerson[]): string[] {
  return people.filter((person) => body.includes(mentionLabel(person))).map((person) => person.id);
}

/**
 * Το «@…» που γράφεται τώρα (πριν από τον κέρσορα), για τη λίστα με τα στελέχη:
 * τι έχει γραφτεί μετά το «@» και πού είναι το «@». Μέσα σε λέξη (email) όχι.
 */
export function mentionQuery(text: string, caret: number): { query: string; from: number } | null {
  const match = /(?:^|\s)@([^\s@]*)$/u.exec(text.slice(0, caret));
  if (!match) return null;
  return { query: match[1] ?? '', from: caret - (match[1]?.length ?? 0) - 1 };
}

/** Χωρίς τόνους και πεζά — «μαρ» βρίσκει «Μαρία», «ελ» την «Ελένη». */
export function searchable(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('el');
}

/** Το κείμενο σε κομμάτια: οι αναφορές χωριστά, για να επισημαίνονται. */
export function splitMentions(body: string, people: readonly CommentPerson[]): { text: string; mention: boolean }[] {
  const labels = people.map(mentionLabel).filter((label) => label.length > 1);
  if (!labels.length) return [{ text: body, mention: false }];
  const pattern = new RegExp(`(${labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gu');
  return body
    .split(pattern)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, mention: labels.includes(part) }));
}
