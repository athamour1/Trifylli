import {
  isProgrammatiko,
  type CollabPresenceUser,
  type DrasiExtraItemView,
  type DrasiScheduleItemView,
  type DrasiScheduleStatus,
  type DrasiScheduleView,
} from '@trifylli/shared';

/** Οι στήλες του kanban, με τη σειρά τους. */
export const KANBAN_STATUSES: readonly DrasiScheduleStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];

/** Κάρτα του kanban: στοιχείο του ωρολογίου ή προγραμματικό εκτός ωρολογίου. */
export type KanbanCard = DrasiScheduleItemView | DrasiExtraItemView;

/** Εκτός ωρολογίου: δεν έχει ημέρα και ώρα. */
export const isExtra = (card: KanbanCard): card is DrasiExtraItemView => !('startsAt' in card);

/**
 * Τα προγραμματικά σε στήλες ανά κατάσταση: τα στοιχεία του ωρολογίου που έχουν
 * κείμενο να γραφτεί (`isProgrammatiko` — όχι γεύματα, ξεκούραση, υπηρεσίες,
 * εκτός αν έχουν ήδη γραμμένο προγραμματικό) με τη σειρά του ωρολογίου, και μετά
 * όσα είναι εκτός ωρολογίου, με τη σειρά που προστέθηκαν. Μια δραστηριότητα με
 * δεκατιανό μένει: είναι δραστηριότητα.
 */
export function kanbanColumns(view: DrasiScheduleView): Record<DrasiScheduleStatus, KanbanCard[]> {
  const columns: Record<DrasiScheduleStatus, KanbanCard[]> = { TODO: [], IN_PROGRESS: [], DONE: [] };
  const items = view.days
    .flatMap((day) => day.items)
    .filter(isProgrammatiko)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.order - b.order);
  for (const item of items) columns[item.status].push(item);
  for (const extra of [...view.extras].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) columns[extra.status].push(extra);
  return columns;
}

/** Η κάρτα (του ωρολογίου ή έξτρα) με αυτό το id. */
export function findCard(view: DrasiScheduleView, id: string): KanbanCard | undefined {
  return view.days.flatMap((day) => day.items).find((i) => i.id === id) ?? view.extras.find((e) => e.id === id);
}

/** Η κάρτα αλλάζει στήλη στη μνήμη (πριν απαντήσει ο server) — `false` αν δεν άλλαξε τίποτα. */
export function moveCard(view: DrasiScheduleView, itemId: string, status: DrasiScheduleStatus): boolean {
  const item = findCard(view, itemId);
  if (!item || item.status === status) return false;
  item.status = status;
  return true;
}

/**
 * Τι λέει στους άλλους όποιος σέρνει μια κάρτα (παρουσία του δωματίου, `focus`):
 * ποια κάρτα κρατά και, αν περνά πάνω από στήλη, ποια.
 */
export function kanbanFocus(cardId: string, over: DrasiScheduleStatus | null): string {
  return `kanban:${cardId}${over ? `>${over}` : ''}`;
}

/**
 * Ποιοι σέρνουν τώρα κάρτες: ανά κάρτα όσοι την κρατούν, ανά στήλη όσοι
 * περνούν από πάνω της. Ό,τι δεν είναι κάρτα του kanban αγνοείται.
 */
export function kanbanPeers(peers: readonly { user: CollabPresenceUser; focus: string | null }[]): {
  cards: Map<string, CollabPresenceUser[]>;
  columns: Map<DrasiScheduleStatus, CollabPresenceUser[]>;
} {
  const cards = new Map<string, CollabPresenceUser[]>();
  const columns = new Map<DrasiScheduleStatus, CollabPresenceUser[]>();
  const add = <K>(map: Map<K, CollabPresenceUser[]>, key: K, user: CollabPresenceUser): void => {
    const list = map.get(key) ?? [];
    if (!list.some((u) => u.id === user.id)) map.set(key, [...list, user]);
  };
  for (const { user, focus } of peers) {
    if (!focus?.startsWith('kanban:')) continue;
    const [cardId, over] = focus.slice('kanban:'.length).split('>');
    if (!cardId) continue;
    add(cards, cardId, user);
    if (over && (KANBAN_STATUSES as readonly string[]).includes(over)) add(columns, over as DrasiScheduleStatus, user);
  }
  return { cards, columns };
}
