/**
 * Τα email με τους προσωπικούς συνδέσμους (έντυπα, αξιολόγηση): σε ποιον πάνε
 * και τι λένε. Ο σύνδεσμος υπάρχει μόνο τη στιγμή της έκδοσης (στη βάση μένει
 * το hash του), γι' αυτό το email φεύγει από εκεί όπου τον βλέπει το στέλεχος.
 */

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/**
 * Σε όποιον υπογράφει: ο ανήλικος στους κηδεμόνες του από το e-SEO (ή στο email
 * της καρτέλας του, αν κανένας δεν έχει), ο ενήλικος — και το στέλεχος — στον ίδιο.
 */
export function linkRecipients(member: { email: string | null; guardians?: { email: string | null }[] }, isMinor: boolean): string[] {
  const own = clean([member.email]);
  if (!isMinor) return own;
  const guardians = clean((member.guardians ?? []).map((g) => g.email));
  return guardians.length ? guardians : own;
}

function clean(list: readonly (string | null | undefined)[]): string[] {
  const byKey = new Map<string, string>();
  for (const raw of list) {
    const email = raw?.trim();
    if (email && EMAIL.test(email) && !byKey.has(email.toLowerCase())) byKey.set(email.toLowerCase(), email);
  }
  return [...byKey.values()];
}

export type LinkEmailKind = 'SYMMETOXI' | 'YGEIA' | 'REVIEW';

export interface LinkEmailInput {
  kind: LinkEmailKind;
  drasi: { title: string; dateStart: Date; dateEnd: Date; location: string | null };
  topiko: string;
  /** «Επώνυμο Όνομα» του μέλους που αφορά. */
  participant: string;
  url: string;
  expiresAt: Date;
  timeZone?: string;
}

const SUBJECT: Record<LinkEmailKind, string> = {
  SYMMETOXI: 'Δήλωση συμμετοχής',
  YGEIA: 'Πιστοποιητικό υγείας',
  REVIEW: 'Αξιολόγηση',
};

export function linkEmail(input: LinkEmailInput): { subject: string; text: string; html: string } {
  const timeZone = input.timeZone ?? 'Europe/Athens';
  const day = (d: Date) => new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone }).format(d);
  const dates = day(input.drasi.dateStart) === day(input.drasi.dateEnd) ? day(input.drasi.dateStart) : `${day(input.drasi.dateStart)} – ${day(input.drasi.dateEnd)}`;
  const when = [dates, input.drasi.location?.trim()].filter(Boolean).join(', ');
  const what = `«${input.drasi.title}» (${when})`;

  const intro =
    input.kind === 'REVIEW'
      ? `Πώς σας φάνηκε η δράση ${what}; Η αξιολόγηση για το μέλος μας ${input.participant} θέλει λίγα λεπτά.`
      : `Για τη δράση ${what} χρειαζόμαστε ${input.kind === 'SYMMETOXI' ? 'τη Δήλωση συμμετοχής' : 'το Πιστοποιητικό υγείας'} για το μέλος μας ${input.participant}.`;
  const action = input.kind === 'REVIEW' ? 'Απαντάτε εδώ:' : 'Συμπληρώνεται εδώ:';
  const note = `Ο σύνδεσμος είναι προσωπικός και ισχύει έως ${day(input.expiresAt)}. Κλείνει μόλις υποβληθεί.`;

  const text = ['Γεια σας,', '', intro, '', action, input.url, '', note, '', input.topiko].join('\n');
  const html = [
    '<p>Γεια σας,</p>',
    `<p>${escapeHtml(intro)}</p>`,
    `<p>${escapeHtml(action)}<br><a href="${escapeHtml(input.url)}">${escapeHtml(input.url)}</a></p>`,
    `<p style="color:#666">${escapeHtml(note)}</p>`,
    `<p>${escapeHtml(input.topiko)}</p>`,
  ].join('\n');

  return { subject: `${SUBJECT[input.kind]} — ${input.drasi.title}`, text, html };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
