import { ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { RequestUser } from '../../common/auth/types';
import { DraseisFormsService } from './draseis-forms.service';
import type { MailableLink } from './link-mailer';

const DRASI = 'd-1';
const user = { id: 'u-arxigos', topikoId: 't-1', email: 'arxigos@example.org' } as unknown as RequestUser;
const TOKEN_A = 'a'.repeat(43);
const TOKEN_B = 'b'.repeat(43);
const hash = (t: string) => createHash('sha256').update(t).digest('hex');
const future = new Date(Date.now() + 86_400_000);

function setup(enabled = true) {
  const child = { firstName: 'Ελένη', lastName: 'Παπά', email: 'paidi@example.org', birthDate: new Date('2015-03-01'), guardians: [{ email: 'mama@example.org' }] };
  const stelexos = { firstName: 'Θάνος', lastName: 'Μ.', email: 'thanos@example.org', birthDate: null, guardians: [] };
  const forms = [
    { id: 'f-child', type: 'SYMMETOXI', status: 'SENT', tokenHash: hash(TOKEN_A), expiresAt: future, drasi: { dateStart: new Date('2026-11-14') }, participant: { kind: 'MELOS', user: child } },
    { id: 'f-staff', type: 'YGEIA', status: 'OPENED', tokenHash: hash(TOKEN_B), expiresAt: future, drasi: { dateStart: new Date('2026-11-14') }, participant: { kind: 'STELEXOS', user: stelexos } },
    { id: 'f-void', type: 'YGEIA', status: 'VOID', tokenHash: null, expiresAt: future, drasi: { dateStart: new Date('2026-11-14') }, participant: { kind: 'MELOS', user: child } },
  ];
  const updates: { id: string; sentTo: string }[] = [];
  const prisma = {
    drasiForm: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => forms.filter((f) => where.id.in.includes(f.id)),
      update: async ({ where, data }: { where: { id: string }; data: { sentTo: string } }) => void updates.push({ id: where.id, sentTo: data.sentTo }),
    },
  };
  const mailed: MailableLink[] = [];
  const linkMailer = {
    enabled,
    send: async (_u: RequestUser, _d: string, links: MailableLink[]) => {
      mailed.push(...links);
      return links.map((l) => ({ id: l.id, sent: true, to: l.to, error: null }));
    },
  };
  const access = { load: async () => ({ id: DRASI }) };
  const audit = { record: async () => undefined };
  const config = { CORS_ORIGINS: 'https://app.example.org/' };
  const service = new DraseisFormsService(prisma as never, access as never, {} as never, audit as never, {} as never, config as never, {} as never, linkMailer as never, {} as never);
  return { service, mailed, updates };
}

describe('σύνδεσμοι εντύπων με email', () => {
  it('φεύγει σε όποιον υπογράφει: κηδεμόνας για το παιδί, ο ίδιος για το στέλεχος', async () => {
    const { service, mailed, updates } = setup();
    const result = await service.emailLinks(user, DRASI, { links: [{ id: 'f-child', token: TOKEN_A }, { id: 'f-staff', token: TOKEN_B }] });

    expect(result.map((r) => [r.id, r.sent, r.to])).toEqual([
      ['f-child', true, ['mama@example.org']],
      ['f-staff', true, ['thanos@example.org']],
    ]);
    expect(mailed.map((m) => [m.kind, m.participant, m.url])).toEqual([
      ['SYMMETOXI', 'Παπά Ελένη', `https://app.example.org/forms/${TOKEN_A}`],
      ['YGEIA', 'Μ. Θάνος', `https://app.example.org/forms/${TOKEN_B}`],
    ]);
    expect(updates).toEqual([
      { id: 'f-child', sentTo: 'mama@example.org' },
      { id: 'f-staff', sentTo: 'thanos@example.org' },
    ]);
  });

  it('token που δεν είναι του εντύπου, ή ακυρωμένος σύνδεσμος: δεν φεύγει τίποτα', async () => {
    const { service, mailed } = setup();
    const result = await service.emailLinks(user, DRASI, { links: [{ id: 'f-child', token: TOKEN_B }, { id: 'f-void', token: TOKEN_A }, { id: 'f-missing', token: TOKEN_A }] });
    expect(result.every((r) => !r.sent && r.error)).toBe(true);
    expect(mailed).toEqual([]);
  });

  it('χωρίς SMTP στον server: 503, όχι σιωπηλή αποτυχία', async () => {
    const { service } = setup(false);
    await expect(service.emailLinks(user, DRASI, { links: [{ id: 'f-child', token: TOKEN_A }] })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
