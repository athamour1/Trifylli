import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DraseisFormsService } from './draseis-forms.service';

const TOKEN = 'a'.repeat(43);
const hash = (t: string) => createHash('sha256').update(t).digest('hex');

function setup(status: string) {
  const form = {
    id: 'f-1',
    drasiId: 'd-1',
    type: 'SYMMETOXI',
    status,
    tokenHash: hash(TOKEN),
    expiresAt: new Date(Date.now() + 86_400_000),
    drasi: { title: 'Κατασκήνωση', dateStart: new Date('2026-11-14'), dateEnd: new Date('2026-11-15'), location: null, topiko: { name: 'Τ' }, klados: null },
    participant: { kind: 'MELOS', user: { firstName: 'Ελένη', lastName: 'Παπά', birthDate: new Date('2015-03-01'), guardians: [] } },
  };
  const prisma = { drasiForm: { findUnique: async () => form, update: async () => undefined } };
  const sent: { name: string; topic: string }[] = [];
  const collab = { broadcast: (name: string, change: { topic: string }) => sent.push({ name, topic: change.topic }) };
  const service = new DraseisFormsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, collab as never);
  return { service, sent };
}

describe('έντυπα: ο γονέας ανοίγει τον σύνδεσμο', () => {
  it('η πρώτη φορά (στάλθηκε → το άνοιξε) φτάνει ζωντανά στη δράση', async () => {
    const { service, sent } = setup('SENT');
    await service.open(TOKEN, '1.2.3.4');
    expect(sent).toEqual([{ name: 'drasi:d-1:room', topic: 'forms' }]);
  });

  it('ξανάνοιγμα ενός ήδη ανοιγμένου: τίποτα δεν άλλαξε, κανένα μήνυμα', async () => {
    const { service, sent } = setup('OPENED');
    await service.open(TOKEN, '1.2.3.4');
    expect(sent).toEqual([]);
  });
});
