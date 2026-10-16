/**
 * Σύγκριση δύο εκδόσεων ενός κειμένου, για το ιστορικό: ανά γραμμή, και μέσα
 * στις γραμμές που άλλαξαν ανά λέξη — όπως το διαβάζει κανείς, όχι ανά χαρακτήρα.
 */

export interface DiffSegment {
  kind: 'same' | 'add' | 'del';
  text: string;
}

export interface DiffLine {
  kind: 'same' | 'add' | 'del';
  segments: DiffSegment[];
}

type Op<T> = { kind: 'same' | 'add' | 'del'; value: T };

/** Πάνω από τόσα κελιά, η σύγκριση γίνεται χοντρικά (όλη η μέση ως αλλαγή) — για να μην κολλήσει η σελίδα. */
const MAX_CELLS = 2_000_000;

/** Η μεγαλύτερη κοινή υπακολουθία, με την κοινή αρχή και το κοινό τέλος έξω από τον πίνακα. */
function lcs<T>(a: readonly T[], b: readonly T[]): Op<T>[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end += 1;

  const head: Op<T>[] = a.slice(0, start).map((value) => ({ kind: 'same', value }));
  const tail: Op<T>[] = a.slice(a.length - end).map((value) => ({ kind: 'same', value }));
  const midA = a.slice(start, a.length - end);
  const midB = b.slice(start, b.length - end);

  if (midA.length * midB.length > MAX_CELLS) {
    return [...head, ...midA.map((value) => ({ kind: 'del' as const, value })), ...midB.map((value) => ({ kind: 'add' as const, value })), ...tail];
  }

  const rows = midA.length + 1;
  const cols = midB.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = midA.length - 1; i >= 0; i -= 1) {
    for (let j = midB.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] = midA[i] === midB[j] ? table[(i + 1) * cols + j + 1]! + 1 : Math.max(table[(i + 1) * cols + j]!, table[i * cols + j + 1]!);
    }
  }
  const middle: Op<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < midA.length && j < midB.length) {
    if (midA[i] === midB[j]) {
      middle.push({ kind: 'same', value: midA[i]! });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * cols + j]! >= table[i * cols + j + 1]!) {
      middle.push({ kind: 'del', value: midA[i]! });
      i += 1;
    } else {
      middle.push({ kind: 'add', value: midB[j]! });
      j += 1;
    }
  }
  while (i < midA.length) middle.push({ kind: 'del', value: midA[i++]! });
  while (j < midB.length) middle.push({ kind: 'add', value: midB[j++]! });
  return [...head, ...middle, ...tail];
}

/** Λέξεις και κενά χωριστά, ώστε να ξαναενώνονται όπως ήταν. */
function words(line: string): string[] {
  return line.split(/(\s+)/).filter((token) => token !== '');
}

/** Ενώνει συνεχόμενα κομμάτια του ίδιου είδους. */
function merge(segments: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const segment of segments) {
    const last = out.at(-1);
    if (last && last.kind === segment.kind) last.text += segment.text;
    else out.push({ ...segment });
  }
  return out;
}

/** Μια γραμμή που άλλαξε: η παλιά με ό,τι έφυγε, η νέα με ό,τι μπήκε. */
function changedPair(before: string, after: string): [DiffLine, DiffLine] {
  const ops = lcs(words(before), words(after));
  const del = merge(ops.filter((op) => op.kind !== 'add').map((op) => ({ kind: op.kind, text: op.value })));
  const add = merge(ops.filter((op) => op.kind !== 'del').map((op) => ({ kind: op.kind, text: op.value })));
  return [
    { kind: 'del', segments: del },
    { kind: 'add', segments: add },
  ];
}

export function diffText(before: string, after: string): DiffLine[] {
  const ops = lcs(before ? before.split('\n') : [], after ? after.split('\n') : []);
  const lines: DiffLine[] = [];
  for (let index = 0; index < ops.length; ) {
    const op = ops[index]!;
    if (op.kind === 'same') {
      lines.push({ kind: 'same', segments: [{ kind: 'same', text: op.value }] });
      index += 1;
      continue;
    }
    // Μια σειρά από αλλαγές: όσες γραμμές έφυγαν, όσες μπήκαν — σε ζεύγη όπου γίνεται.
    const removed: string[] = [];
    const added: string[] = [];
    while (index < ops.length && ops[index]!.kind !== 'same') {
      const change = ops[index]!;
      (change.kind === 'del' ? removed : added).push(change.value);
      index += 1;
    }
    const pairs = Math.min(removed.length, added.length);
    const pairedDel: DiffLine[] = [];
    const pairedAdd: DiffLine[] = [];
    for (let k = 0; k < pairs; k += 1) {
      const [del, add] = changedPair(removed[k]!, added[k]!);
      pairedDel.push(del);
      pairedAdd.push(add);
    }
    lines.push(
      ...pairedDel,
      ...removed.slice(pairs).map((text): DiffLine => ({ kind: 'del', segments: [{ kind: 'del', text }] })),
      ...pairedAdd,
      ...added.slice(pairs).map((text): DiffLine => ({ kind: 'add', segments: [{ kind: 'add', text }] })),
    );
  }
  return lines;
}

/** Άλλαξε κάτι; */
export function hasChanges(lines: readonly DiffLine[]): boolean {
  return lines.some((line) => line.kind !== 'same');
}
