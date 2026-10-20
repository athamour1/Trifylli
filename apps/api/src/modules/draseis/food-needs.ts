import { canSeeFoodNeeds } from '@trifylli/shared';

export { canSeeFoodNeeds };

const NO_DETAILS = 'ναι (χωρίς λεπτομέρειες)';

/** Ό,τι αφορά την κουζίνα από μία δήλωση υγείας: αλλεργίες και ειδική διατροφή. */
export function foodNeedsOf(d: Record<string, unknown>): { allergies: string | null; diet: string | null } {
  const pick = (key: 'allergies' | 'diet'): string | null => {
    if (d[key] !== true) return null;
    const details = typeof d[`${key}Details`] === 'string' ? (d[`${key}Details`] as string).trim() : '';
    return details || NO_DETAILS;
  };
  return { allergies: pick('allergies'), diet: pick('diet') };
}
