/**
 * Η καταμέτρηση (Φ13) — οι κανόνες της, χωριστά από τη βάση.
 */

/** Ενωμένα σύνολα: όσοι είναι σε ομάδα, όσοι μετρήθηκαν παρόντες ή απόντες, πόσες ομάδες μετρήθηκαν. */
export function headcountTotals(groups: readonly { members: readonly string[]; check: { absentIds: readonly string[] } | null }[]): {
  members: number;
  present: number;
  absent: number;
  checkedGroups: number;
  groups: number;
} {
  const counted = groups.filter((group) => group.members.length > 0);
  let present = 0;
  let absent = 0;
  let checkedGroups = 0;
  for (const group of counted) {
    if (!group.check) continue;
    checkedGroups += 1;
    const missing = group.members.filter((member) => group.check!.absentIds.includes(member)).length;
    absent += missing;
    present += group.members.length - missing;
  }
  return { members: counted.reduce((sum, group) => sum + group.members.length, 0), present, absent, checkedGroups, groups: counted.length };
}

/** Μια μέτρηση που φτάνει (ίσως αργότερα, από την ουρά χωρίς σήμα) μετράει αν είναι νεότερη από ό,τι υπάρχει. */
export function newerCheck(existing: { checkedAt: Date } | null, incoming: Date): boolean {
  return !existing || existing.checkedAt.getTime() <= incoming.getTime();
}
