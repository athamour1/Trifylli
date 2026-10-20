import { describe, expect, it } from 'vitest';
import { liveRoom, topikoTopic, verbOf } from './live-changes';

const ID = '3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b';

describe('ποιο δωμάτιο ενημερώνει μια αλλαγή μέσω API', () => {
  it('δράση: το κομμάτι μετά το id είναι το θέμα', () => {
    expect(liveRoom('/api/draseis/:id/schedule/:itemId', { id: ID })).toEqual({ name: `drasi:${ID}:room`, topic: 'schedule' });
    expect(liveRoom('/api/draseis/:id/groups/:groupId/members', { id: ID })).toEqual({ name: `drasi:${ID}:room`, topic: 'groups' });
    expect(liveRoom('/api/draseis/:id/ypiresies/:serviceId', { id: ID })).toEqual({ name: `drasi:${ID}:room`, topic: 'ypiresies' });
  });

  it('η ίδια η δράση (ρυθμίσεις, αρχειοθέτηση): θέμα «drasi»', () => {
    expect(liveRoom('/api/draseis/:id', { id: ID })).toEqual({ name: `drasi:${ID}:room`, topic: 'drasi' });
  });

  it('συγκέντρωση και συμβούλιο: το έγγραφό τους είναι και το δωμάτιο', () => {
    expect(liveRoom('/api/syggentrwseis/:id', { id: ID })).toEqual({ name: `syggentrwsh:${ID}`, topic: 'header' });
    expect(liveRoom('/api/symvoulia/:id/finalize', { id: ID })).toEqual({ name: `symvoulio:${ID}`, topic: 'finalize' });
  });

  it('παρουσιολόγιο: η διαδρομή ξεκινά από αλλού, το θέμα είναι η αρχή της', () => {
    expect(liveRoom('/api/parousiologio/syggentrwsh/:id', { id: ID })).toEqual({ name: `syggentrwsh:${ID}`, topic: 'parousiologio' });
  });

  it('χωρίς id (νέα οντότητα) ή με id που δεν είναι uuid: κανένα δωμάτιο', () => {
    expect(liveRoom('/api/draseis', {})).toBeNull();
    expect(liveRoom('/api/draseis/:id', { id: 'όχι-id' })).toBeNull();
    expect(liveRoom('/api/meloi/:id', { id: ID })).toBeNull();
    expect(liveRoom(undefined, { id: ID })).toBeNull();
  });

  it('με άλλο πρόθεμα API το θέμα δεν μπερδεύεται με το πρόθεμα', () => {
    expect(liveRoom('/v1/draseis/:id', { id: ID }, 'v1')).toEqual({ name: `drasi:${ID}:room`, topic: 'drasi' });
    expect(liveRoom('/v1/parousiologio/syggentrwsh/:id', { id: ID }, 'v1')).toEqual({ name: `syggentrwsh:${ID}`, topic: 'parousiologio' });
  });
});

describe('τι έγινε, από τη μέθοδο', () => {
  it('νέο, αλλαγή, αφαίρεση — η μετακίνηση και η οριστικοποίηση είναι αλλαγές', () => {
    expect(verbOf('POST', '/api/draseis/x/schedule')).toBe('add');
    expect(verbOf('POST', '/api/draseis/x/schedule/y/move')).toBe('change');
    expect(verbOf('POST', '/api/symvoulia/x/finalize')).toBe('change');
    expect(verbOf('PATCH', '/api/draseis/x/schedule/y')).toBe('change');
    expect(verbOf('PUT', '/api/draseis/x/roles')).toBe('change');
    expect(verbOf('DELETE', '/api/draseis/x/groups/y')).toBe('remove');
  });
});

describe('τι άλλαξε για το δωμάτιο του Τοπικού', () => {
  it('η ενότητα του API — και για αλλαγές μέσα σε οντότητα', () => {
    expect(topikoTopic('/api/meloi/:id')).toBe('meloi');
    expect(topikoTopic('/api/yliko/:id/bookings')).toBe('yliko');
    expect(topikoTopic('/api/draseis')).toBe('draseis');
    expect(topikoTopic('/api/draseis/:id/schedule/:itemId')).toBe('draseis');
  });

  it('κάτω από κλάδο: η ενότητα του κλάδου· ο ίδιος ο κλάδος: «kladoi»', () => {
    expect(topikoTopic('/api/kladoi/:klados/arxigeio')).toBe('arxigeio');
    expect(topikoTopic('/api/kladoi/:klados')).toBe('kladoi');
  });

  it('ό,τι αφορά μόνο τον χρήστη ή φτάνει ήδη στο έγγραφό του: τίποτα', () => {
    for (const path of ['/api/notifications/:id/read', '/api/comments', '/api/approvals/:id', '/api/files', '/api/me/tracking-notice', '/api/reads']) {
      expect(topikoTopic(path)).toBeNull();
    }
    expect(topikoTopic(undefined)).toBeNull();
  });

  it('με άλλο πρόθεμα API', () => {
    expect(topikoTopic('/v1/syndromes/:id', 'v1')).toBe('syndromes');
  });
});
