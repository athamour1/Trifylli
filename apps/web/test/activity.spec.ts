import { describe, expect, it } from 'vitest';
import type { DrasiActivityEvent } from '@trifylli/shared';
import { activityPhrase, sectionOfTopic, unseenSections } from '../src/lib/activity';

const event = (topic: string, verb: string, at: string, actorId = 'u-2', count = 1): DrasiActivityEvent => ({
  id: `${topic}-${at}`,
  topic,
  verb,
  count,
  at,
  actor: { id: actorId, firstName: 'Μαρία', lastName: 'Παπαδοπούλου' },
});

describe('ροή δραστηριότητας — στη σελίδα', () => {
  it('φράσεις στα ελληνικά, με τις συνεχόμενες αλλαγές μαζί', () => {
    expect(activityPhrase(event('schedule', 'change', '2026-10-16T10:00:00Z'))).toBe('Μαρία Π. άλλαξε το ωρολόγιο');
    expect(activityPhrase(event('schedule', 'add', '2026-10-16T10:00:00Z'))).toBe('Μαρία Π. πρόσθεσε στο ωρολόγιο');
    expect(activityPhrase(event('groups', 'remove', '2026-10-16T10:00:00Z'))).toBe('Μαρία Π. αφαίρεσε από τις ομάδες');
    expect(activityPhrase(event('doc:meal', 'write', '2026-10-16T10:00:00Z', 'u-2', 3))).toBe('Μαρία Π. έγραψε σε γεύμα (3)');
    expect(activityPhrase(event('κάτι-νέο', 'change', '2026-10-16T10:00:00Z'))).toBe('Μαρία Π. άλλαξε τη δράση');
  });

  it('κάθε σημείο ανήκει σε μια ενότητα της δράσης', () => {
    expect(sectionOfTopic('schedule')).toBe('programma');
    expect(sectionOfTopic('doc:item')).toBe('programma');
    expect(sectionOfTopic('doc:meal')).toBe('diatrofologio');
    expect(sectionOfTopic('ledger')).toBe('tamio');
    expect(sectionOfTopic('άγνωστο')).toBeNull();
  });

  it('σημαδάκια: ό,τι άλλαξαν οι άλλοι μετά την τελευταία σου επίσκεψη', () => {
    const events = [
      event('schedule', 'change', '2026-10-16T10:00:00Z'),
      event('groups', 'add', '2026-10-16T08:00:00Z'),
      event('treasury', 'add', '2026-10-16T11:00:00Z', 'u-me'),
    ];
    expect([...unseenSections(events, '2026-10-16T09:00:00Z', 'u-me')]).toEqual(['programma']);
    // Πρώτη επίσκεψη: τίποτα δεν είναι «από την τελευταία φορά».
    expect([...unseenSections(events, null, 'u-me')]).toEqual([]);
  });
});
