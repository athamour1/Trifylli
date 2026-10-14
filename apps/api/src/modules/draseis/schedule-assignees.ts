/** Οι δύο ευθύνες ενός στοιχείου του ωρολογίου (βλ. `DrasiScheduleDuty`). */
export type ScheduleDuty = 'DIEXAGOGI' | 'YLOPOIISI';

export interface ScheduleAssignee {
  userId: string;
  duty: ScheduleDuty;
}

const DUTIES: readonly ScheduleDuty[] = ['DIEXAGOGI', 'YLOPOIISI'];

/**
 * Από τους τωρινούς υπεύθυνους ενός στοιχείου και τη νέα λίστα κάθε ευθύνης: ποιοι
 * μπαίνουν και ποιοι βγαίνουν. Ευθύνη που δεν στάλθηκε (`undefined`) μένει όπως
 * είναι· `null` ή άδεια λίστα την αδειάζει. Όσοι μένουν δεν αγγίζονται — έτσι
 * μόνο οι νέοι ελέγχονται ότι είναι στελέχη της δράσης.
 */
export function planAssignees(
  current: readonly ScheduleAssignee[],
  wanted: Partial<Record<ScheduleDuty, readonly string[] | null>>,
): { create: ScheduleAssignee[]; remove: ScheduleAssignee[] } {
  const create: ScheduleAssignee[] = [];
  const remove: ScheduleAssignee[] = [];
  for (const duty of DUTIES) {
    const list = wanted[duty];
    if (list === undefined) continue;
    const next = new Set(list ?? []);
    const before = new Set(current.filter((a) => a.duty === duty).map((a) => a.userId));
    for (const userId of next) if (!before.has(userId)) create.push({ userId, duty });
    for (const userId of before) if (!next.has(userId)) remove.push({ userId, duty });
  }
  return { create, remove };
}
