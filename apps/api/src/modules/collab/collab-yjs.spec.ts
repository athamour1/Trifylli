import { describe, expect, it } from 'vitest';
import { COLLAB_GENERATION_KEY, COLLAB_META } from '@trifylli/shared';
import { Doc, applyUpdate, encodeStateAsUpdate } from 'yjs';
import { CollabDocumentRegistry, type CollabDocumentType } from './collab-documents';
import { parseCollabToken, readFields, seedDocument } from './collab-yjs';

const ID = '3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b';

function fakeType(kind: string, arity: 1 | 2 = 1): CollabDocumentType {
  return { kind, arity, access: async () => 'write', seed: async () => true, project: async () => undefined };
}

describe('γέμισμα εγγράφου', () => {
  it('γράφει τα πεδία και τη γενιά, και διαβάζονται πίσω όπως ήταν', () => {
    const doc = new Doc();
    seedDocument(doc, { agenda: '- Απολογισμός', minutes: '' }, 'gen-1');

    expect(readFields(doc, ['agenda', 'minutes'])).toEqual({ agenda: '- Απολογισμός', minutes: '' });
    expect(doc.getMap(COLLAB_META).get(COLLAB_GENERATION_KEY)).toBe('gen-1');
  });

  it('δύο ανεξάρτητα γεμίσματα του ίδιου κειμένου ενώνονται ως διπλό κείμενο — γι’ αυτό υπάρχει η γενιά', () => {
    const server = new Doc();
    const device = new Doc();
    seedDocument(server, { minutes: 'Θέμα' }, 'gen-2');
    seedDocument(device, { minutes: 'Θέμα' }, 'gen-1');

    applyUpdate(server, encodeStateAsUpdate(device));

    expect(readFields(server, ['minutes']).minutes).toBe('ΘέμαΘέμα');
  });
});

describe('token του client', () => {
  it('δέχεται το JSON με token, γενιά και πρωτόκολλο', () => {
    expect(parseCollabToken(JSON.stringify({ t: 'jwt', g: '', p: 1 }))).toEqual({ t: 'jwt', g: '', p: 1 });
  });

  it.each([
    ['κενό', ''],
    ['όχι JSON', 'eyJhbGciOi'],
    ['χωρίς token', JSON.stringify({ t: '', g: '', p: 1 })],
    ['χωρίς πρωτόκολλο', JSON.stringify({ t: 'jwt', g: '' })],
    ['τεράστια γενιά', JSON.stringify({ t: 'jwt', g: 'x'.repeat(65), p: 1 })],
    ['πίνακας', JSON.stringify(['jwt'])],
  ])('απορρίπτει %s', (_label, raw) => {
    expect(parseCollabToken(raw)).toBeNull();
  });
});

describe('ονόματα εγγράφων', () => {
  const ITEM = '9a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d';
  const registry = new CollabDocumentRegistry();
  registry.register(fakeType('symvoulio'));
  registry.register(fakeType('drasi:mythos'));
  registry.register(fakeType('drasi:item', 2));

  it('βρίσκει το είδος και τα ids', () => {
    expect(registry.resolve(`symvoulio:${ID}`)?.ids).toEqual([ID]);
    expect(registry.resolve(`drasi:${ID}:mythos`)?.type.kind).toBe('drasi:mythos');
    expect(registry.resolve(`drasi:${ID}:item:${ITEM}`)?.ids).toEqual([ID, ITEM]);
  });

  it.each([
    ['άγνωστο είδος', `syggentrwsh:${ID}`],
    ['χωρίς id', 'symvoulio:'],
    ['όχι UUID', 'symvoulio:../../etc'],
    ['κεφαλαία', `symvoulio:${ID.toUpperCase()}`],
    ['άγνωστο υποείδος', `symvoulio:${ID}:x`],
    ['χωρίς είδος', ID],
    ['λείπει το δεύτερο id', `drasi:${ID}:item`],
    ['περισσότερο id απ’ όσα θέλει', `drasi:${ID}:mythos:${ITEM}`],
    ['παραπάνω κομμάτια', `drasi:${ID}:item:${ITEM}:x`],
  ])('απορρίπτει %s', (_label, name) => {
    expect(registry.resolve(name)).toBeNull();
  });

  it('δεν δέχεται το ίδιο είδος δύο φορές', () => {
    expect(() => registry.register(fakeType('symvoulio'))).toThrow();
  });
});
