import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import { COLLAB_PROTOCOL, CollabRejection } from '@trifylli/shared';
import WebSocket from 'ws';
import { Doc } from 'yjs';
import type { RequestUser } from '../../common/auth/types';
import { textDocument, type CollabAccess, type CollabDocumentType } from './collab-documents';
import { CollabService } from './collab.service';

/**
 * Ο server της συνεργασίας με πραγματικούς clients (Hocuspocus provider πάνω σε
 * WebSocket) — βάση και λογαριασμοί στη μνήμη.
 */
const APP_ORIGIN = 'http://app.test';
const ID = '3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b';
const NAME = `note:${ID}`;

const user = (id: string, firstName: string): RequestUser =>
  ({ id, firstName, lastName: 'Δοκιμή', topikoId: 'topiko' }) as RequestUser;
const USERS: Record<string, RequestUser> = {
  maria: user('u-maria', 'Μαρία'),
  sofia: user('u-sofia', 'Σοφία'),
  eleni: user('u-eleni', 'Ελένη'),
};

/** Ο browser στέλνει πάντα `Origin` — εδώ το βάζουμε εμείς. */
function socketWithOrigin(origin: string) {
  return class extends WebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, { origin });
    }
  };
}

function until(check: () => boolean, ms = 3000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      if (check()) return resolve();
      if (Date.now() - started > ms) return reject(new Error('timeout'));
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe('CollabService', () => {
  let server: Server;
  let service: CollabService;
  let port: number;
  const entity = { text: 'Αρχικό κείμενο' };
  const access: Record<string, CollabAccess | null> = {};
  const rows = new Map<string, { name: string; state: Buffer; generation: string }>();
  const clients: HocuspocusProvider[] = [];

  const noteType: CollabDocumentType = textDocument({
    kind: 'note',
    arity: 1,
    fields: ['text'],
    access: async (u) => access[u.id] ?? null,
    load: async () => ({ ...entity }),
    save: async (_id, values) => {
      entity.text = values.text ?? '';
    },
  });

  const prisma = {
    collabDocument: {
      findUnique: async ({ where }: { where: { name: string } }) => rows.get(where.name) ?? null,
      create: async ({ data }: { data: { name: string; state: Buffer; generation: string } }) => {
        rows.set(data.name, data);
        return data;
      },
      upsert: async ({ where, create, update }: { where: { name: string }; create: { name: string; state: Buffer; generation: string }; update: { state: Buffer } }) => {
        const row = rows.get(where.name);
        rows.set(where.name, row ? { ...row, ...update } : create);
      },
      deleteMany: async ({ where }: { where: { name: string } }) => {
        rows.delete(where.name);
      },
    },
  };
  /** Πότε λήγει το token σε κάθε έλεγχο (με τη σειρά)· κενό = δεν λήγει. */
  const expiries: number[] = [];
  const auth = {
    verify: async (token: string) =>
      token === 'anaklithike'
        ? 'no-access'
        : USERS[token]
          ? { user: USERS[token], expiresAt: expiries.shift() ?? null }
          : 'invalid',
  };

  function connect(token: string, options: { g?: string; p?: number; origin?: string } = {}) {
    const document = new Doc();
    const failures: string[] = [];
    const socket = new HocuspocusProviderWebsocket({
      url: `ws://127.0.0.1:${port}/api/collab`,
      WebSocketPolyfill: socketWithOrigin(options.origin ?? APP_ORIGIN),
      maxAttempts: 1,
    });
    const provider = new HocuspocusProvider({
      websocketProvider: socket,
      name: NAME,
      document,
      token: JSON.stringify({ t: token, g: options.g ?? '', p: options.p ?? COLLAB_PROTOCOL }),
      onAuthenticationFailed: ({ reason }) => failures.push(reason),
    });
    provider.attach();
    clients.push(provider);
    return { provider, document, failures, text: () => document.getText('text').toString() };
  }

  beforeEach(async () => {
    entity.text = 'Αρχικό κείμενο';
    rows.clear();
    expiries.length = 0;
    for (const key of Object.keys(access)) delete access[key];
    Object.assign(access, { 'u-maria': 'write', 'u-sofia': 'write', 'u-eleni': 'read' });

    server = createServer();
    service = new CollabService(
      prisma as never,
      auth as never,
      { httpAdapter: { getHttpServer: () => server } } as never,
      { API_PREFIX: 'api', CORS_ORIGINS: APP_ORIGIN } as never,
    );
    service.registry.register(noteType);
    service.onApplicationBootstrap();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.configuration.websocketProvider.destroy();
      client.destroy();
    }
    await service.beforeApplicationShutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('γεμίζει από τη βάση και ό,τι γράφει ο ένας το βλέπει αμέσως ο άλλος', async () => {
    const maria = connect('maria');
    const sofia = connect('sofia');
    await until(() => maria.provider.isSynced && sofia.provider.isSynced);
    expect(maria.text()).toBe('Αρχικό κείμενο');

    maria.document.getText('text').insert(0, 'Μαρία: ');
    sofia.document.getText('text').insert(sofia.text().length, ' — Σοφία');
    await until(() => maria.text() === sofia.text() && maria.text().includes('Σοφία') && maria.text().includes('Μαρία'));

    expect(maria.text()).toBe('Μαρία: Αρχικό κείμενο — Σοφία');
  });

  it('σώζει την κατάσταση και γράφει την απλή τιμή στην οντότητα', async () => {
    const maria = connect('maria');
    await until(() => maria.provider.isSynced);
    maria.document.getText('text').insert(0, 'Νέο. ');
    await until(() => service.hocuspocus.documents.get(NAME)?.getText('text').toString().startsWith('Νέο.') ?? false);

    await service.flush(NAME);

    expect(entity.text).toBe('Νέο. Αρχικό κείμενο');
    expect(rows.get(NAME)?.generation).toBeTruthy();
  });

  it('πριν από μια ανάγνωση της βάσης σώζει ό,τι περιμένει την αποθήκευσή του', async () => {
    const maria = connect('maria');
    await until(() => maria.provider.isSynced);
    maria.document.getText('text').insert(0, 'Μόλις γράφτηκε. ');
    await until(() => service.hocuspocus.documents.get(NAME)?.getText('text').toString().startsWith('Μόλις') ?? false);
    expect(entity.text).toBe('Αρχικό κείμενο');

    await service.flushPending('note:');

    expect(entity.text).toBe('Μόλις γράφτηκε. Αρχικό κείμενο');
  });

  it('όποιος μόνο βλέπει, δεν γράφει — το επιβάλλει ο server', async () => {
    const maria = connect('maria');
    const eleni = connect('eleni');
    await until(() => maria.provider.isSynced && eleni.provider.isSynced);
    expect(eleni.provider.authorizedScope).toBe('readonly');

    eleni.document.getText('text').insert(0, 'Δεν θα φανεί. ');
    maria.document.getText('text').insert(0, 'Φαίνεται. ');
    await until(() => eleni.text().includes('Φαίνεται.'));

    expect(maria.text()).toBe('Φαίνεται. Αρχικό κείμενο');
    expect(service.hocuspocus.documents.get(NAME)?.getText('text').toString()).toBe('Φαίνεται. Αρχικό κείμενο');
  });

  it('η παρουσία δείχνει το όνομα του λογαριασμού, όχι ό,τι γράψει ο client', async () => {
    const maria = connect('maria');
    const sofia = connect('sofia');
    await until(() => maria.provider.isSynced && sofia.provider.isSynced);

    maria.provider.setAwarenessField('user', { id: 'u-maria', name: 'Αρχηγός', fullName: 'Αρχηγός', color: '#000' });
    const sofiaSees = () =>
      [...(sofia.provider.awareness?.getStates().values() ?? [])].map((s) => (s.user as { name?: string } | undefined)?.name);
    await until(() => sofiaSees().includes('Μαρία Δ.'));

    expect(sofiaSees()).not.toContain('Αρχηγός');
  });

  it.each([
    ['παλιά έκδοση εφαρμογής', { p: COLLAB_PROTOCOL - 1 }, 'maria', CollabRejection.UPDATE_REQUIRED],
    ['άκυρο token', {}, 'agnwstos', CollabRejection.UNAUTHENTICATED],
    ['λογαριασμό που έχασε την πρόσβαση', {}, 'anaklithike', CollabRejection.FORBIDDEN],
    ['χωρίς πρόσβαση', {}, 'sofia', CollabRejection.FORBIDDEN],
  ] as const)('απορρίπτει %s με λόγο που καταλαβαίνει ο client', async (_label, options, token, reason) => {
    access['u-sofia'] = null;
    const client = connect(token, options);
    await until(() => client.failures.length > 0);
    expect(client.failures).toEqual([reason]);
  });

  it('αντίγραφο συσκευής από άλλη γενιά δεν ενώνεται', async () => {
    const maria = connect('maria');
    await until(() => maria.provider.isSynced);
    const generation = rows.get(NAME)?.generation;

    const stale = connect('sofia', { g: 'palia-genia' });
    const same = connect('sofia', { g: generation });
    await until(() => stale.failures.length > 0 && same.provider.isSynced);

    expect(stale.failures).toEqual([CollabRejection.STALE_GENERATION]);
  });

  it('δεν δέχεται σύνδεση από ξένη σελίδα', async () => {
    const status = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/api/collab`, { origin: 'https://evil.example' });
      ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
      ws.on('open', () => resolve(101));
    });
    expect(status).toBe(403);
  });

  it('λίγο πριν λήξει το token ζητά το καινούργιο και η σύνδεση συνεχίζει', async () => {
    // Λήγει σε 30,3″ → ο server ρωτά σε 0,3″· το νέο token ισχύει μία ώρα.
    expiries.push(Date.now() + 30_300, Date.now() + 3_600_000);
    const maria = connect('maria');
    const closed: string[] = [];
    maria.provider.on('close', ({ event }: { event: { reason: string } }) => closed.push(event.reason));
    await until(() => maria.provider.isSynced && expiries.length === 0);

    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(closed).toEqual([]);
  });

  it('αν δεν έρθει νεότερο token, η σύνδεση κλείνει στη λήξη', async () => {
    // Ρωτά σε 0,3″· ο client στέλνει πάλι ένα token που λήγει σε 0,2″.
    expiries.push(Date.now() + 30_300, Date.now() + 500);
    const maria = connect('maria');
    const closed: string[] = [];
    maria.provider.on('close', ({ event }: { event: { reason: string } }) => closed.push(event.reason));
    await until(() => closed.length > 0);

    expect(closed).toEqual(['token-expired']);
  });

  it('«πάγωμα»: κανείς δεν γράφει ώσπου να ανακληθεί, και ό,τι εκκρεμούσε σώζεται', async () => {
    const maria = connect('maria');
    await until(() => maria.provider.isSynced);
    maria.document.getText('text').insert(0, 'Πριν. ');
    await until(() => service.hocuspocus.documents.get(NAME)?.getText('text').toString().startsWith('Πριν.') ?? false);

    await service.freeze(NAME);
    expect(entity.text).toBe('Πριν. Αρχικό κείμενο');

    maria.document.getText('text').insert(0, 'Μετά. ');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(service.hocuspocus.documents.get(NAME)?.getText('text').toString()).toBe('Πριν. Αρχικό κείμενο');
  });
});
