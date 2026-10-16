import {
  PLAN_KEYS,
  PLAN_LIMITS,
  TIMELINE_SECTION_LABEL,
  TIMELINE_SECTION_ORDER,
  clampInt,
  type CollabVersionPart,
  type PlanBlockSnapshot,
  type PlanSnapshot,
  type PlanYlikoSnapshot,
  type TimelineSection,
} from '@trifylli/shared';
import { Map as YMap, Text as YText, type Doc } from 'yjs';
import { setRows, setText } from '../collab/collab-restore';

/**
 * Το πρόγραμμα της συγκέντρωσης ως κοινό έγγραφο (βλ. `PLAN_KEYS`): γέμισμα από
 * τη βάση, ανάγνωση, και κανονικοποίηση πριν γραφτεί πίσω στη βάση.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ό,τι χρειάζεται το γέμισμα — όπως το δίνει η βάση. */
export interface PlanRows {
  parts: { section: string; notes: string; durationMin: number }[];
  blocks: {
    id: string;
    section: string;
    order: number;
    title: string;
    description: string | null;
    durationMin: number;
    responsibleId: string | null;
    yliko: { qty: number; yliko: { id: string; name: string } }[];
  }[];
  yliko: { id: string; order: number; label: string; qty: number; packed: boolean }[];
  stelexi: string[];
}

/**
 * Πρώτο γέμισμα. Τα τρία μέρη μπαίνουν πάντα — άδεια ή όχι — ώστε κανένας
 * client να μη χρειαστεί να τα φτιάξει: δύο που θα έφτιαχναν μαζί το ίδιο μέρος
 * θα έχαναν ο ένας τις σημειώσεις του άλλου.
 */
export function seedPlan(doc: Doc, rows: PlanRows): void {
  doc.transact(() => {
    const sections = doc.getMap<YMap<unknown>>(PLAN_KEYS.sections);
    const parts = new Map(rows.parts.map((p) => [p.section, p]));
    for (const section of TIMELINE_SECTION_ORDER) {
      const part = new YMap<unknown>();
      part.set('notes', new YText(parts.get(section)?.notes ?? ''));
      part.set('durationMin', parts.get(section)?.durationMin ?? 0);
      sections.set(section, part);
    }

    const blocks = doc.getMap<YMap<unknown>>(PLAN_KEYS.blocks);
    for (const row of rows.blocks) {
      const block = new YMap<unknown>();
      block.set('section', row.section);
      block.set('order', row.order);
      block.set('title', row.title);
      block.set('durationMin', row.durationMin);
      block.set('responsibleId', row.responsibleId);
      block.set('yliko', row.yliko.map((use) => ({ id: use.yliko.id, name: use.yliko.name, qty: use.qty })));
      block.set('description', new YText(row.description ?? ''));
      blocks.set(row.id, block);
    }

    const yliko = doc.getMap<YMap<unknown>>(PLAN_KEYS.yliko);
    for (const row of rows.yliko) {
      const item = new YMap<unknown>();
      item.set('order', row.order);
      item.set('label', row.label);
      item.set('qty', row.qty);
      item.set('packed', row.packed);
      yliko.set(row.id, item);
    }

    const stelexi = doc.getMap<boolean>(PLAN_KEYS.stelexi);
    for (const userId of rows.stelexi) stelexi.set(userId, true);
  });
}

const sectionRank = (section: string): number => {
  const rank = TIMELINE_SECTION_ORDER.indexOf(section as TimelineSection);
  return rank < 0 ? TIMELINE_SECTION_ORDER.length : rank;
};

/** Η απλή μορφή του προγράμματος, ταξινομημένη. */
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
  for (const [id, block] of doc.getMap<YMap<unknown>>(PLAN_KEYS.blocks).entries()) {
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
  for (const [id, item] of doc.getMap<YMap<unknown>>(PLAN_KEYS.yliko).entries()) {
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

/** Ό,τι γράφεται στη βάση: σειρές με ακέραια σειρά ανά μέρος και τιμές μέσα στα όρια. */
export interface PlanWrite {
  blocks: {
    id: string;
    section: TimelineSection;
    order: number;
    title: string;
    description: string | null;
    durationMin: number;
    responsibleId: string | null;
    yliko: { ylikoId: string; qty: number }[];
  }[];
  sections: { section: TimelineSection; notes: string; durationMin: number }[];
  yliko: { id: string; order: number; label: string; qty: number; packed: boolean }[];
  stelexi: string[];
}

/**
 * Κανονικοποίηση πριν τη βάση (ερώτημα 6): λάθος τιμές **διορθώνονται**, δεν
 * απορρίπτονται — λεπτά μέσα στα όρια, υπεύθυνος μόνο στέλεχος του κλάδου, υλικό
 * μόνο της αποθήκης, κενές γραμμές υλικού έξω. Ένα κοινό έγγραφο δεν μπορεί να
 * πει «όχι» σε μια αλλαγή· μπορεί να μην τη γράψει λάθος.
 */
export function normalizePlan(plan: PlanSnapshot, allowed: { stelexi: ReadonlySet<string>; yliko: ReadonlySet<string> }): PlanWrite {
  const orderBySection = new Map<string, number>();
  const blocks: PlanWrite['blocks'] = [];
  for (const block of plan.blocks) {
    if (!UUID.test(block.id) || !TIMELINE_SECTION_ORDER.includes(block.section as TimelineSection)) continue;
    const order = orderBySection.get(block.section) ?? 0;
    orderBySection.set(block.section, order + 1);
    blocks.push({
      id: block.id,
      section: block.section as TimelineSection,
      order,
      title: block.title.trim().slice(0, PLAN_LIMITS.title),
      description: block.description.trim() ? block.description : null,
      durationMin: clampInt(block.durationMin, PLAN_LIMITS.blockMinutes, 10),
      responsibleId: block.responsibleId && allowed.stelexi.has(block.responsibleId) ? block.responsibleId : null,
      yliko: block.yliko
        .filter((use) => allowed.yliko.has(use.id))
        .map((use) => ({ ylikoId: use.id, qty: clampInt(use.qty, PLAN_LIMITS.qty, 1) })),
    });
  }

  // Τα άδεια μέρη δεν γράφονται: κενό κείμενο και μηδενική διάρκεια δεν είναι πληροφορία.
  const sections: PlanWrite['sections'] = TIMELINE_SECTION_ORDER.map((section) => ({
    section,
    notes: plan.sections[section]?.notes ?? '',
    durationMin: clampInt(plan.sections[section]?.durationMin ?? 0, PLAN_LIMITS.sectionMinutes, 0),
  })).filter((part) => part.notes.trim().length > 0 || part.durationMin > 0);

  const yliko = plan.yliko
    .filter((item) => UUID.test(item.id) && item.label.trim())
    .map((item, order) => ({
      id: item.id,
      order,
      label: item.label.trim().slice(0, PLAN_LIMITS.label),
      qty: clampInt(item.qty, PLAN_LIMITS.qty, 1),
      packed: item.packed,
    }));

  return { blocks, sections, yliko, stelexi: plan.stelexi.filter((userId) => allowed.stelexi.has(userId)) };
}

// ───────────────────────── Ιστορικό ─────────────────────────

/** Μια έκδοση του προγράμματος (από το JSON της βάσης) — ό,τι λείπει ή είναι λάθος, κενό. */
function versionPlan(content: Record<string, unknown>): PlanSnapshot {
  const sections = (typeof content.sections === 'object' && content.sections !== null ? content.sections : {}) as PlanSnapshot['sections'];
  const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
  return {
    sections,
    blocks: list<PlanBlockSnapshot>(content.blocks).filter((block) => typeof block?.id === 'string'),
    yliko: list<PlanYlikoSnapshot>(content.yliko).filter((item) => typeof item?.id === 'string'),
    stelexi: list<string>(content.stelexi).filter((id) => typeof id === 'string'),
  };
}

/** Το πρόγραμμα όπως διαβάζεται: κάθε μέρος με τις σημειώσεις και τα κομμάτια του, μετά το υλικό. */
export function presentPlan(content: Record<string, unknown>): CollabVersionPart[] {
  const plan = versionPlan(content);
  const parts: CollabVersionPart[] = TIMELINE_SECTION_ORDER.map((section) => {
    const notes = String(plan.sections[section]?.notes ?? '');
    const blocks = plan.blocks
      .filter((block) => block.section === section)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .map((block) => [`- ${block.title || 'Χωρίς τίτλο'} (${Number(block.durationMin) || 0}΄)`, ...String(block.description ?? '').split('\n').filter((line) => line.trim()).map((line) => `  ${line}`)].join('\n'));
    return { key: section, label: TIMELINE_SECTION_LABEL[section], text: [notes, ...blocks].filter(Boolean).join('\n') };
  });
  parts.push({
    key: 'yliko',
    label: 'Υλικό',
    text: [...plan.yliko]
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
      .map((item) => `- ${item.label}${item.qty > 1 ? ` ×${item.qty}` : ''}${item.packed ? ' ✓' : ''}`)
      .join('\n'),
  });
  parts.push({ key: 'stelexi', label: 'Στελέχη', text: plan.stelexi.length ? `${plan.stelexi.length} στελέχη` : '' });
  return parts;
}

/** Το πρόγραμμα όπως ήταν στην έκδοση — ως νέα αλλαγή, με τις μικρότερες αλλαγές. */
export function restorePlan(doc: Doc, content: Record<string, unknown>): void {
  const plan = versionPlan(content);
  doc.transact(() => {
    const sections = doc.getMap<YMap<unknown>>(PLAN_KEYS.sections);
    for (const section of TIMELINE_SECTION_ORDER) {
      const wanted = plan.sections[section];
      let part = sections.get(section);
      if (!(part instanceof YMap)) {
        part = new YMap<unknown>();
        part.set('notes', new YText(''));
        part.set('durationMin', 0);
        sections.set(section, part);
      }
      const notes = part.get('notes');
      if (notes instanceof YText) setText(notes, String(wanted?.notes ?? ''));
      else part.set('notes', new YText(String(wanted?.notes ?? '')));
      const minutes = Number(wanted?.durationMin ?? 0) || 0;
      if (part.get('durationMin') !== minutes) part.set('durationMin', minutes);
    }
    setRows(
      doc.getMap(PLAN_KEYS.blocks),
      plan.blocks.map((block) => ({
        id: block.id,
        section: block.section,
        order: block.order,
        title: block.title,
        durationMin: block.durationMin,
        responsibleId: block.responsibleId ?? null,
        yliko: block.yliko ?? [],
        description: block.description ?? '',
      })),
      ['description'],
    );
    setRows(
      doc.getMap(PLAN_KEYS.yliko),
      plan.yliko.map((item) => ({ id: item.id, order: item.order, label: item.label, qty: item.qty, packed: item.packed === true })),
    );
    const stelexi = doc.getMap<boolean>(PLAN_KEYS.stelexi);
    const wanted = new Set(plan.stelexi);
    for (const userId of [...stelexi.keys()]) if (!wanted.has(userId)) stelexi.delete(userId);
    for (const userId of wanted) if (stelexi.get(userId) !== true) stelexi.set(userId, true);
  });
}
