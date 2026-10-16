import type { ApprovalStatus, ApprovalSummaryRow } from '@trifylli/shared';

/** Πώς φαίνεται κάθε κατάσταση της έγκρισης. */
export const APPROVAL_META: Record<ApprovalStatus, { label: string; icon: string; color: string }> = {
  PROXEIRO: { label: 'Πρόχειρο', icon: 'edit_note', color: 'grey-7' },
  ELEGXOS: { label: 'Για έλεγχο', icon: 'pending_actions', color: 'orange-8' },
  EGKRITHIKE: { label: 'Εγκρίθηκε', icon: 'task_alt', color: 'positive' },
};

export interface ItemApproval {
  status: ApprovalStatus;
  changedAfter: boolean;
}

/** Οι εγκρίσεις της δράσης ανά στοιχείο του ωρολογίου: το προγραμματικό (`item`) και το γεύμα (`meal`) χωριστά. */
export function approvalsByItem(rows: readonly ApprovalSummaryRow[], drasiId: string): { item: Map<string, ItemApproval>; meal: Map<string, ItemApproval> } {
  const item = new Map<string, ItemApproval>();
  const meal = new Map<string, ItemApproval>();
  for (const row of rows) {
    const [base, id, kind, itemId] = row.document.split(':');
    if (base !== 'drasi' || id !== drasiId || !itemId) continue;
    const target = kind === 'item' ? item : kind === 'meal' ? meal : null;
    target?.set(itemId, { status: row.status, changedAfter: row.changedAfter });
  }
  return { item, meal };
}

/** «8 εγκρίθηκαν · 3 για έλεγχο · 5 πρόχειρα» — ό,τι δεν έχει γραμμή έγκρισης είναι πρόχειρο. */
export function approvalCounts(itemIds: readonly string[], approvals: ReadonlyMap<string, ItemApproval>): Record<ApprovalStatus, number> & { changedAfter: number } {
  const counts = { PROXEIRO: 0, ELEGXOS: 0, EGKRITHIKE: 0, changedAfter: 0 };
  for (const id of itemIds) {
    const approval = approvals.get(id);
    counts[approval?.status ?? 'PROXEIRO'] += 1;
    if (approval?.changedAfter) counts.changedAfter += 1;
  }
  return counts;
}
