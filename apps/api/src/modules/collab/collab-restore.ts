import { Map as YMap, Text as YText } from 'yjs';

/**
 * Επαναφορά μιας έκδοσης (Φ10) ως **νέα** αλλαγή, με τις μικρότερες δυνατές
 * αλλαγές: όποιος γράφει εκείνη τη στιγμή δεν χάνει τη θέση του, και ό,τι δεν
 * διαφέρει δεν αγγίζεται.
 */

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

/**
 * Το κείμενο γίνεται `value`: μένουν η κοινή αρχή και το κοινό τέλος, και
 * αλλάζει μόνο ό,τι είναι ανάμεσα — ποτέ στη μέση ενός χαρακτήρα (emoji).
 */
export function setText(text: YText, value: string): void {
  const current = text.toString();
  if (current === value) return;
  let start = 0;
  while (start < current.length && start < value.length && current[start] === value[start]) start += 1;
  if (start > 0 && isHighSurrogate(current.charCodeAt(start - 1))) start -= 1;
  let end = 0;
  while (
    end < current.length - start &&
    end < value.length - start &&
    current[current.length - 1 - end] === value[value.length - 1 - end]
  ) {
    end += 1;
  }
  if (end > 0 && isLowSurrogate(current.charCodeAt(current.length - end))) end -= 1;
  const remove = current.length - start - end;
  const insert = value.slice(start, value.length - end);
  const apply = (): void => {
    if (remove > 0) text.delete(start, remove);
    if (insert) text.insert(start, insert);
  };
  if (text.doc) text.doc.transact(apply);
  else apply();
}

/** Ίδια τιμή; Οι λίστες και τα αντικείμενα (π.χ. το υλικό ενός κομματιού) ως τιμές. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Οι γραμμές μιας λίστας (id → `Y.Map`) όπως στην έκδοση: φεύγουν όσες λείπουν,
 * μπαίνουν όσες έλειπαν, και στις υπόλοιπες αλλάζουν μόνο τα πεδία που
 * διαφέρουν. Τα πεδία του `texts` είναι κείμενα (`Y.Text`), όχι απλές τιμές.
 */
export function setRows<T>(rowsMap: YMap<T>, rows: readonly ({ id: string } & Record<string, unknown>)[], texts: readonly string[] = []): void {
  const map = rowsMap as unknown as YMap<unknown>;
  const wanted = new Map(rows.map((row) => [row.id, row]));
  for (const id of [...map.keys()]) if (!wanted.has(id)) map.delete(id);
  for (const [id, { id: _id, ...fields }] of wanted) {
    let row = map.get(id);
    if (!(row instanceof YMap)) {
      const fresh = new YMap<unknown>();
      for (const [key, value] of Object.entries(fields)) fresh.set(key, texts.includes(key) ? new YText(String(value ?? '')) : value);
      map.set(id, fresh);
      continue;
    }
    const target: YMap<unknown> = row;
    for (const [key, value] of Object.entries(fields)) {
      const current = target.get(key);
      if (texts.includes(key)) {
        if (current instanceof YText) setText(current, String(value ?? ''));
        else target.set(key, new YText(String(value ?? '')));
      } else if (!same(current, value)) {
        target.set(key, value);
      }
    }
  }
}
