/**
 * Οι ψηφοφορίες του συμβουλίου (Φ14): το μέτρημα και το κείμενο που μπαίνει
 * στα πρακτικά όταν κλείνει μια ψηφοφορία.
 */

/** Πόσοι διάλεξαν κάθε επιλογή — ό,τι είναι εκτός επιλογών δεν μετράει. */
export function pollCounts(options: number, choices: readonly number[]): number[] {
  const counts = Array.from({ length: options }, () => 0);
  for (const choice of choices) if (Number.isInteger(choice) && choice >= 0 && choice < options) counts[choice]! += 1;
  return counts;
}

/**
 * Το αποτέλεσμα, για τα πρακτικά (Markdown): τα σύνολα, πόσοι ψήφισαν από
 * τους συμμετέχοντες — και, στις επώνυμες, ποιος ψήφισε τι.
 */
export function pollResultText(
  poll: { question: string; options: readonly string[]; secret: boolean; closedAt: Date },
  counts: readonly number[],
  voters: readonly { name: string; voted: boolean; choice: number | null }[],
  timeZone = 'Europe/Athens',
): string {
  const date = poll.closedAt.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone });
  const voted = voters.filter((voter) => voter.voted).length;
  const lines = [
    `**Ψηφοφορία${poll.secret ? ' (μυστική)' : ''}:** ${poll.question}`,
    `${poll.options.map((option, index) => `${option} ${counts[index] ?? 0}`).join(' · ')} — ψήφισαν ${voted} από ${voters.length} (${date})`,
  ];
  if (!poll.secret) {
    poll.options.forEach((option, index) => {
      const names = voters.filter((voter) => voter.choice === index).map((voter) => voter.name);
      if (names.length) lines.push(`- ${option}: ${names.join(', ')}`);
    });
  }
  return lines.join('\n');
}
