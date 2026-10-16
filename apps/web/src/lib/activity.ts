import { collabShortName, type DrasiActivityEvent } from '@trifylli/shared';

/**
 * Η ροή δραστηριότητας της δράσης στη σελίδα: τι λέει κάθε γραμμή («η Μαρία
 * άλλαξε το ωρολόγιο») και σε ποια ενότητα ανήκει — για τα σημαδάκια «άλλαξε από
 * την τελευταία σου επίσκεψη».
 */

/** Κάθε σημείο: το άρθρο του («το ωρολόγιο»), η πρόθεση («στο ωρολόγιο») και η ενότητά του. */
const TOPICS: Record<string, { the: string; in: string; section: string }> = {
  schedule: { the: 'το ωρολόγιο', in: 'στο ωρολόγιο', section: 'programma' },
  'doc:item': { the: 'ένα προγραμματικό', in: 'σε προγραμματικό', section: 'programma' },
  diatrofologio: { the: 'το διατροφολόγιο', in: 'στο διατροφολόγιο', section: 'diatrofologio' },
  'doc:meal': { the: 'ένα γεύμα', in: 'σε γεύμα', section: 'diatrofologio' },
  mythos: { the: 'τον μύθο', in: 'στον μύθο', section: 'mythos' },
  'doc:mythos': { the: 'την ιστορία του μύθου', in: 'στην ιστορία του μύθου', section: 'mythos' },
  characters: { the: 'τους ρόλους του μύθου', in: 'στους ρόλους του μύθου', section: 'mythos' },
  'doc:character': { the: 'έναν ρόλο του μύθου', in: 'σε ρόλο του μύθου', section: 'mythos' },
  participants: { the: 'τους συμμετέχοντες', in: 'στους συμμετέχοντες', section: 'participants' },
  guests: { the: 'τους φιλοξενούμενους', in: 'στους φιλοξενούμενους', section: 'participants' },
  groups: { the: 'τις ομάδες', in: 'στις ομάδες', section: 'omades' },
  ypiresies: { the: 'τις υπηρεσίες', in: 'στις υπηρεσίες', section: 'ypiresies' },
  slots: { the: 'τις υπηρεσίες', in: 'στις υπηρεσίες', section: 'ypiresies' },
  rotate: { the: 'τις υπηρεσίες', in: 'στις υπηρεσίες', section: 'ypiresies' },
  forms: { the: 'τα έντυπα', in: 'στα έντυπα', section: 'entypa' },
  pharmacy: { the: 'το φαρμακείο', in: 'στο φαρμακείο', section: 'farmakeio' },
  yliko: { the: 'το υλικό', in: 'στο υλικό', section: 'yliko' },
  externals: { the: 'τα εξωτερικά στελέχη', in: 'στα εξωτερικά στελέχη', section: 'arxigeio' },
  roles: { the: 'το αρχηγείο', in: 'στο αρχηγείο', section: 'arxigeio' },
  treasury: { the: 'το ταμείο', in: 'στο ταμείο', section: 'tamio' },
  ledger: { the: 'το ταμείο', in: 'στο ταμείο', section: 'tamio' },
  budget: { the: 'τον προϋπολογισμό', in: 'στον προϋπολογισμό', section: 'tamio' },
  payments: { the: 'τις πληρωμές', in: 'στις πληρωμές', section: 'tamio' },
  symvoulia: { the: 'τα συμβούλια', in: 'στα συμβούλια', section: 'symvoulia' },
  review: { the: 'την αξιολόγηση', in: 'στην αξιολόγηση', section: 'axiologisi' },
  drasi: { the: 'τις ρυθμίσεις', in: 'στις ρυθμίσεις', section: 'rythmiseis' },
  'doc:settings': { the: 'την περιγραφή', in: 'στην περιγραφή', section: 'rythmiseis' },
  settings: { the: 'τις ρυθμίσεις', in: 'στις ρυθμίσεις', section: 'rythmiseis' },
  kladoi: { the: 'ποιοι έρχονται', in: 'στο ποιοι έρχονται', section: 'rythmiseis' },
  'guest-topika': { the: 'ποιοι έρχονται', in: 'στο ποιοι έρχονται', section: 'rythmiseis' },
  closed: { the: 'την κατάσταση της δράσης', in: 'στην κατάσταση της δράσης', section: 'rythmiseis' },
};

const FALLBACK = { the: 'τη δράση', in: 'στη δράση', section: null };

/** Η ενότητα της δράσης όπου ανήκει ένα σημείο — `null` αν δεν ανήκει πουθενά. */
export function sectionOfTopic(topic: string): string | null {
  return TOPICS[topic]?.section ?? null;
}

/** «Μαρία Π. άλλαξε το ωρολόγιο», «Σοφία Κ. έγραψε σε γεύμα (3)». */
export function activityPhrase(event: DrasiActivityEvent): string {
  const topic = TOPICS[event.topic] ?? FALLBACK;
  const who = event.actor ? collabShortName(event.actor.firstName, event.actor.lastName) : 'Κάποιος';
  const what =
    event.verb === 'add'
      ? `πρόσθεσε ${topic.in}`
      : event.verb === 'remove'
        ? `αφαίρεσε από ${topic.the}`
        : event.verb === 'write'
          ? `έγραψε ${topic.in}`
          : `άλλαξε ${topic.the}`;
  return `${who} ${what}${event.count > 1 ? ` (${event.count})` : ''}`;
}

/**
 * Οι ενότητες όπου άλλαξε κάτι κάποιος άλλος μετά την τελευταία σου επίσκεψη.
 * Στην πρώτη επίσκεψη δεν υπάρχει «από την τελευταία φορά»: τίποτα.
 */
export function unseenSections(events: readonly DrasiActivityEvent[], lastSeenAt: string | null, me: string | undefined): Set<string> {
  const sections = new Set<string>();
  if (!lastSeenAt) return sections;
  const since = new Date(lastSeenAt).getTime();
  for (const event of events) {
    if (event.actor?.id === me || new Date(event.at).getTime() <= since) continue;
    const section = sectionOfTopic(event.topic);
    if (section) sections.add(section);
  }
  return sections;
}
