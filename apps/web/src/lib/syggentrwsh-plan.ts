import {
  PLAN_KEYS,
  PLAN_LIMITS,
  TIMELINE_SECTION_ORDER,
  clampInt,
  type PlanBlockSnapshot,
  type PlanSnapshot,
  type PlanYlikoSnapshot,
  type TimelineSection,
} from '@trifylli/shared';
import { Map as YMap, Text as YText, type Doc } from 'yjs';

/**
 * Το πρόγραμμα της συγκέντρωσης πάνω στο κοινό έγγραφο (`syggentrwsh:<id>`, βλ.
 * `PLAN_KEYS`): ανάγνωση για τη σελίδα και οι αλλαγές της. Κάθε αλλαγή είναι
 * **μικρή** — ένα πεδίο, ένας αριθμός σειράς — ώστε δύο που γράφουν μαζί να μη
 * σβήνει ο ένας τον άλλον. Τα μέρη (`sections`) τα φτιάχνει μόνο ο server.
 */

/** Προεπιλεγμένη διάρκεια νέου κομματιού. */
export const DEFAULT_BLOCK_MINUTES = 10;

/**
 * Ο αριθμός ενός πεδίου όσο γράφεται — `null` όταν είναι κενό ή μισό («-»).
 * Τότε δεν γράφεται τίποτα στο έγγραφο: ένα κενό θα γινόταν αμέσως 1 και το
 * «30» που πληκτρολογείται μετά θα έβγαινε «130».
 */
export function typedNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const blocksOf = (doc: Doc) => doc.getMap<YMap<unknown>>(PLAN_KEYS.blocks);
const ylikoOf = (doc: Doc) => doc.getMap<YMap<unknown>>(PLAN_KEYS.yliko);

const sectionRank = (section: string): number => {
  const rank = TIMELINE_SECTION_ORDER.indexOf(section as TimelineSection);
  return rank < 0 ? TIMELINE_SECTION_ORDER.length : rank;
};

/** Η απλή μορφή του προγράμματος, ταξινομημένη — ίδια με του server. */
export function readPlan(doc: Doc): PlanSnapshot {
  const sections: PlanSnapshot['sections'] = {};
  const sectionMap = doc.getMap<YMap<unknown>>(PLAN_KEYS.sections);
  for (const section of TIMELINE_SECTION_ORDER) {
    const part = sectionMap.get(section);
    sections[section] = {
      notes: (part?.get('notes') as YText | undefined)?.toString() ?? '',
      durationMin: Number(part?.get('durationMin') ?? 0),
    };
  }

  const blocks: PlanBlockSnapshot[] = [];
  for (const [id, block] of blocksOf(doc).entries()) {
    blocks.push({
      id,
      section: String(block.get('section') ?? ''),
      order: Number(block.get('order') ?? 0),
      title: String(block.get('title') ?? ''),
      durationMin: Number(block.get('durationMin') ?? 0),
      responsibleId: (block.get('responsibleId') as string | null | undefined) ?? null,
      yliko: Array.isArray(block.get('yliko')) ? (block.get('yliko') as PlanBlockSnapshot['yliko']) : [],
      description: (block.get('description') as YText | undefined)?.toString() ?? '',
    });
  }
  blocks.sort((a, b) => sectionRank(a.section) - sectionRank(b.section) || a.order - b.order || a.id.localeCompare(b.id));

  const yliko: PlanYlikoSnapshot[] = [];
  for (const [id, item] of ylikoOf(doc).entries()) {
    yliko.push({
      id,
      order: Number(item.get('order') ?? 0),
      label: String(item.get('label') ?? ''),
      qty: Number(item.get('qty') ?? 1),
      packed: item.get('packed') === true,
    });
  }
  yliko.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

  const stelexi = [...doc.getMap<boolean>(PLAN_KEYS.stelexi).entries()].filter(([, on]) => on).map(([userId]) => userId).sort();

  return { sections, blocks, yliko, stelexi };
}

// ───────────────────────── Κείμενα (για τον επεξεργαστή) ─────────────────────────

/** Οι σημειώσεις ενός μέρους — `null` όσο το έγγραφο δεν έχει γεμίσει. */
export function sectionNotes(doc: Doc, section: string): YText | null {
  const part = doc.getMap<YMap<unknown>>(PLAN_KEYS.sections).get(section);
  const notes = part?.get('notes');
  return notes instanceof YText ? notes : null;
}

/** Η περιγραφή ενός κομματιού. */
export function blockDescription(doc: Doc, id: string): YText | null {
  const description = blocksOf(doc).get(id)?.get('description');
  return description instanceof YText ? description : null;
}

// ───────────────────────── Κομμάτια ─────────────────────────

/** Νέο κομμάτι στο τέλος του μέρους. */
export function addBlock(doc: Doc, section: string): string {
  const id = crypto.randomUUID();
  const last = readPlan(doc).blocks.filter((b) => b.section === section).at(-1);
  doc.transact(() => {
    const block = new YMap<unknown>();
    block.set('section', section);
    block.set('order', (last?.order ?? 0) + 1);
    block.set('title', '');
    block.set('durationMin', DEFAULT_BLOCK_MINUTES);
    block.set('responsibleId', null);
    block.set('yliko', []);
    block.set('description', new YText());
    blocksOf(doc).set(id, block);
  });
  return id;
}

export function updateBlock(doc: Doc, id: string, change: { title?: string; durationMin?: number; responsibleId?: string | null }): void {
  const block = blocksOf(doc).get(id);
  if (!block) return;
  doc.transact(() => {
    if (change.title !== undefined) block.set('title', change.title.slice(0, PLAN_LIMITS.title));
    if (change.durationMin !== undefined) block.set('durationMin', clampInt(change.durationMin, PLAN_LIMITS.blockMinutes, DEFAULT_BLOCK_MINUTES));
    if (change.responsibleId !== undefined) block.set('responsibleId', change.responsibleId);
  });
}

/**
 * Πάνω/κάτω μέσα στο μέρος: ανταλλαγή αριθμών σειράς με τον γείτονα — δεν
 * ξαναγράφεται το κομμάτι, οπότε ό,τι γράφει κάποιος στην περιγραφή του μένει.
 */
export function moveBlock(doc: Doc, id: string, step: -1 | 1): void {
  const plan = readPlan(doc);
  const current = plan.blocks.find((b) => b.id === id);
  if (!current) return;
  const siblings = plan.blocks.filter((b) => b.section === current.section);
  const index = siblings.findIndex((b) => b.id === id);
  const neighbour = siblings[index + step];
  if (!neighbour) return;
  doc.transact(() => {
    // Ίδιοι αριθμοί (π.χ. δύο που πρόσθεσαν μαζί): ο γείτονας παίρνει ±1 ώστε η ανταλλαγή να φαίνεται.
    const neighbourOrder = neighbour.order === current.order ? current.order + step : neighbour.order;
    blocksOf(doc).get(id)?.set('order', neighbourOrder);
    blocksOf(doc).get(neighbour.id)?.set('order', current.order);
  });
}

export function removeBlock(doc: Doc, id: string): void {
  blocksOf(doc).delete(id);
}

export function removeBlockYliko(doc: Doc, blockId: string, ylikoId: string): void {
  const block = blocksOf(doc).get(blockId);
  if (!block) return;
  const uses = Array.isArray(block.get('yliko')) ? (block.get('yliko') as PlanBlockSnapshot['yliko']) : [];
  block.set(
    'yliko',
    uses.filter((use) => use.id !== ylikoId),
  );
}

/** Η διάρκεια του μέρους — μετράει μόνο όταν δεν έχει κομμάτια. */
export function setSectionDuration(doc: Doc, section: string, minutes: number): void {
  doc.getMap<YMap<unknown>>(PLAN_KEYS.sections).get(section)?.set('durationMin', clampInt(minutes, PLAN_LIMITS.sectionMinutes, 0));
}

// ───────────────────────── Υλικό ─────────────────────────

/** Νέα γραμμή μετά από άλλη (ή στην αρχή): αριθμός σειράς ανάμεσα στους δύο γείτονες. */
export function addYlikoAfter(doc: Doc, afterId: string | null): string {
  const items = readPlan(doc).yliko;
  const index = afterId ? items.findIndex((item) => item.id === afterId) : -1;
  const before = index >= 0 ? items[index]!.order : (items[0]?.order ?? 1) - 1;
  const after = items[index + 1]?.order;
  const order = after === undefined ? before + 1 : (before + after) / 2;
  const id = crypto.randomUUID();
  doc.transact(() => {
    const item = new YMap<unknown>();
    item.set('order', order);
    item.set('label', '');
    item.set('qty', 1);
    item.set('packed', false);
    ylikoOf(doc).set(id, item);
  });
  return id;
}

export function updateYliko(doc: Doc, id: string, change: { label?: string; qty?: number; packed?: boolean }): void {
  const item = ylikoOf(doc).get(id);
  if (!item) return;
  doc.transact(() => {
    if (change.label !== undefined) item.set('label', change.label.slice(0, PLAN_LIMITS.label));
    if (change.qty !== undefined) item.set('qty', clampInt(change.qty, PLAN_LIMITS.qty, 1));
    if (change.packed !== undefined) item.set('packed', change.packed);
  });
}

export function removeYliko(doc: Doc, id: string): void {
  ylikoOf(doc).delete(id);
}

// ───────────────────────── Στελέχη ─────────────────────────

/** Ένα στέλεχος μέσα/έξω — σύνολο, ώστε δύο που τσεκάρουν μαζί να μην ακυρώνουν ο ένας τον άλλον. */
export function setStelexos(doc: Doc, userId: string, selected: boolean): void {
  const stelexi = doc.getMap<boolean>(PLAN_KEYS.stelexi);
  if (selected) stelexi.set(userId, true);
  else stelexi.delete(userId);
}
