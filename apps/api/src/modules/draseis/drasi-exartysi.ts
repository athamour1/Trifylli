import { randomUUID } from 'node:crypto';
import {
  DEFAULT_EXARTYSI,
  EXARTYSI_KEYS,
  EXARTYSI_LIMITS,
  type CollabVersionPart,
  type DrasiExartysiView,
} from '@trifylli/shared';
import { Map as YMap, type Doc } from 'yjs';
import { setRows } from '../collab/collab-restore';

/**
 * Η εξάρτυση ως κοινό έγγραφο (βλ. `EXARTYSI_KEYS`): γέμισμα από τη βάση (ή το
 * πρότυπο), ανάγνωση με κανονικοποίηση, ιστορικό.
 */

/** Οι γραμμές όπως ζουν στο έγγραφο — και όπως κρατιούνται στο ιστορικό. */
export interface ExartysiRows {
  info: { title: string; footer: string };
  sections: { id: string; order: number; title: string; note: string }[];
  items: { id: string; section: string; order: number; label: string }[];
}

const clip = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Η αποθηκευμένη εξάρτυση της δράσης — ή το πρότυπο, αν δεν άνοιξε ποτέ. */
export function exartysiOrDefault(stored: unknown): DrasiExartysiView {
  const view = stored as Partial<DrasiExartysiView> | null;
  if (view && Array.isArray(view.sections)) {
    return {
      title: clip(view.title, EXARTYSI_LIMITS.title),
      footer: clip(view.footer, EXARTYSI_LIMITS.footer),
      sections: view.sections.map((section) => ({
        id: String(section.id),
        title: clip(section.title, EXARTYSI_LIMITS.title),
        note: clip(section.note, EXARTYSI_LIMITS.note),
        items: (Array.isArray(section.items) ? section.items : []).map((item) => ({ id: String(item.id), label: clip(item.label, EXARTYSI_LIMITS.label) })),
      })),
    };
  }
  return {
    title: DEFAULT_EXARTYSI.title,
    footer: DEFAULT_EXARTYSI.footer,
    sections: DEFAULT_EXARTYSI.sections.map((section) => ({
      id: randomUUID(),
      title: section.title,
      note: section.note ?? '',
      items: section.items.map((label) => ({ id: randomUUID(), label })),
    })),
  };
}

/** Από την προβολή στις γραμμές του εγγράφου (σειρά = θέση). */
export function rowsOfView(view: DrasiExartysiView): ExartysiRows {
  return {
    info: { title: view.title, footer: view.footer },
    sections: view.sections.map((section, index) => ({ id: section.id, order: index + 1, title: section.title, note: section.note })),
    items: view.sections.flatMap((section) =>
      section.items.map((item, index) => ({ id: item.id, section: section.id, order: index + 1, label: item.label })),
    ),
  };
}

/** Πρώτο γέμισμα — μόνο ο server, ώστε δύο που ανοίγουν μαζί να μη διπλασιάσουν τις γραμμές. */
export function seedExartysi(doc: Doc, view: DrasiExartysiView): void {
  writeRows(doc, rowsOfView(view));
}

function writeRows(doc: Doc, rows: ExartysiRows): void {
  doc.transact(() => {
    const info = doc.getMap<unknown>(EXARTYSI_KEYS.info);
    if (info.get('title') !== rows.info.title) info.set('title', rows.info.title);
    if (info.get('footer') !== rows.info.footer) info.set('footer', rows.info.footer);
    setRows(doc.getMap(EXARTYSI_KEYS.sections), rows.sections);
    setRows(doc.getMap(EXARTYSI_KEYS.items), rows.items);
  });
}

function rowsOfMap(doc: Doc, key: string): { id: string; order: number; row: YMap<unknown> }[] {
  const rows: { id: string; order: number; row: YMap<unknown> }[] = [];
  for (const [id, row] of doc.getMap<unknown>(key).entries()) {
    if (row instanceof YMap) rows.push({ id, order: Number(row.get('order') ?? 0) || 0, row });
  }
  return rows.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** Οι γραμμές του εγγράφου, όπως είναι (για το ιστορικό). */
export function readExartysiRows(doc: Doc): ExartysiRows {
  const info = doc.getMap<unknown>(EXARTYSI_KEYS.info);
  return {
    info: { title: String(info.get('title') ?? ''), footer: String(info.get('footer') ?? '') },
    sections: rowsOfMap(doc, EXARTYSI_KEYS.sections).map(({ id, order, row }) => ({
      id,
      order,
      title: String(row.get('title') ?? ''),
      note: String(row.get('note') ?? ''),
    })),
    items: rowsOfMap(doc, EXARTYSI_KEYS.items).map(({ id, order, row }) => ({
      id,
      order,
      section: String(row.get('section') ?? ''),
      label: String(row.get('label') ?? ''),
    })),
  };
}

/**
 * Η εξάρτυση όπως γράφεται στη βάση: με σειρά, μέσα στα όρια, χωρίς γραμμές
 * ενότητας που σβήστηκε. Ό,τι βγαίνει έξω κόβεται — δεν απορρίπτεται.
 */
export function viewOfRows(rows: ExartysiRows): DrasiExartysiView {
  const sections = rows.sections.slice(0, EXARTYSI_LIMITS.sections);
  const known = new Set(sections.map((section) => section.id));
  const items = rows.items.filter((item) => known.has(item.section)).slice(0, EXARTYSI_LIMITS.items);
  return {
    title: clip(rows.info.title, EXARTYSI_LIMITS.title),
    footer: clip(rows.info.footer, EXARTYSI_LIMITS.footer),
    sections: sections.map((section) => ({
      id: section.id,
      title: clip(section.title, EXARTYSI_LIMITS.title),
      note: clip(section.note, EXARTYSI_LIMITS.note),
      items: items.filter((item) => item.section === section.id).map((item) => ({ id: item.id, label: clip(item.label, EXARTYSI_LIMITS.label) })),
    })),
  };
}

export function readExartysi(doc: Doc): DrasiExartysiView {
  return viewOfRows(readExartysiRows(doc));
}

function versionRows(content: Record<string, unknown>): ExartysiRows {
  const info = (content.info ?? {}) as Partial<ExartysiRows['info']>;
  return {
    info: { title: String(info.title ?? ''), footer: String(info.footer ?? '') },
    sections: Array.isArray(content.sections) ? (content.sections as ExartysiRows['sections']) : [],
    items: Array.isArray(content.items) ? (content.items as ExartysiRows['items']) : [],
  };
}

/** Μια έκδοση όπως διαβάζεται: μία ενότητα ανά κομμάτι, τα είδη ως λίστα. */
export function presentExartysi(content: Record<string, unknown>): CollabVersionPart[] {
  const view = viewOfRows(versionRows(content));
  return [
    { key: 'title', label: 'Τίτλος', text: view.title },
    ...view.sections.map((section) => ({
      key: section.id,
      label: section.title || 'Χωρίς τίτλο',
      text: [...section.items.map((item) => `- ${item.label}`), section.note ? `_${section.note}_` : ''].filter(Boolean).join('\n'),
    })),
    { key: 'footer', label: 'Σημείωση', text: view.footer },
  ];
}

/** Η εξάρτυση όπως ήταν στην έκδοση — ως νέα αλλαγή, με τις μικρότερες αλλαγές. */
export function restoreExartysi(doc: Doc, content: Record<string, unknown>): void {
  writeRows(doc, versionRows(content));
}
