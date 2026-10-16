import { describe, expect, it } from 'vitest';
import type { ApprovalSummaryRow } from '@trifylli/shared';
import { approvalCounts, approvalsByItem } from '../src/lib/approvals';

const DRASI = '11111111-1111-4111-8111-111111111111';
const item = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const rows: ApprovalSummaryRow[] = [
  { document: `drasi:${DRASI}:item:${item(1)}`, status: 'EGKRITHIKE', changedAfter: false },
  { document: `drasi:${DRASI}:item:${item(2)}`, status: 'ELEGXOS', changedAfter: false },
  { document: `drasi:${DRASI}:meal:${item(3)}`, status: 'EGKRITHIKE', changedAfter: true },
  { document: `drasi:${DRASI}:settings`, status: 'EGKRITHIKE', changedAfter: false },
];

describe('εγκρίσεις της δράσης', () => {
  it('ανά στοιχείο του ωρολογίου: το προγραμματικό και το γεύμα χωριστά', () => {
    const { item: items, meal } = approvalsByItem(rows, DRASI);
    expect(items.get(item(1))?.status).toBe('EGKRITHIKE');
    expect(items.get(item(2))?.status).toBe('ELEGXOS');
    expect(meal.get(item(3))).toEqual({ status: 'EGKRITHIKE', changedAfter: true });
    expect(items.size).toBe(2);
  });

  it('μέτρημα: ό,τι δεν έχει γραμμή είναι πρόχειρο', () => {
    const { item: items } = approvalsByItem(rows, DRASI);
    expect(approvalCounts([item(1), item(2), item(4), item(5)], items)).toEqual({ EGKRITHIKE: 1, ELEGXOS: 1, PROXEIRO: 2, changedAfter: 0 });
  });
});
