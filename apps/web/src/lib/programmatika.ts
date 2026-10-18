import type { DrasiScheduleItemView, DrasiScheduleStatus, DrasiScheduleView } from '@trifylli/shared';

/** Οι στήλες του kanban, με τη σειρά τους. */
export const KANBAN_STATUSES: readonly DrasiScheduleStatus[] = ['TODO', 'IN_PROGRESS', 'DONE'];

/**
 * Τα προγραμματικά σε στήλες ανά κατάσταση: όλα τα στοιχεία του ωρολογίου εκτός
 * από τα γεύματα (αυτά τα ετοιμάζει το διατροφολόγιο) — μια δραστηριότητα με
 * δεκατιανό μένει, είναι δραστηριότητα. Μέσα στη στήλη: με τη σειρά του ωρολογίου.
 */
export function kanbanColumns(view: DrasiScheduleView): Record<DrasiScheduleStatus, DrasiScheduleItemView[]> {
  const columns: Record<DrasiScheduleStatus, DrasiScheduleItemView[]> = { TODO: [], IN_PROGRESS: [], DONE: [] };
  const items = view.days
    .flatMap((day) => day.items)
    .filter((item) => item.kind !== 'GEVMA')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.order - b.order);
  for (const item of items) columns[item.status].push(item);
  return columns;
}

/** Η κάρτα αλλάζει στήλη στη μνήμη (πριν απαντήσει ο server) — `false` αν δεν άλλαξε τίποτα. */
export function moveCard(view: DrasiScheduleView, itemId: string, status: DrasiScheduleStatus): boolean {
  const item = view.days.flatMap((day) => day.items).find((i) => i.id === itemId);
  if (!item || item.status === status) return false;
  item.status = status;
  return true;
}
