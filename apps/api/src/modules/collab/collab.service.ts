import { randomUUID } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import {
  Hocuspocus,
  type Connection,
  type Document,
  type Extension,
  type onAuthenticatePayload,
  type onLoadDocumentPayload,
  type onStoreDocumentPayload,
} from '@hocuspocus/server';
import {
  COLLAB_GENERATION_KEY,
  COLLAB_META,
  COLLAB_PATH,
  COLLAB_PROTOCOL,
  CollabRejection,
  collabColor,
  collabShortName,
  type CollabPresenceUser,
} from '@trifylli/shared';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';
import { AppConfigToken } from '../../common/config/config.module';
import { corsOrigins, type AppConfig } from '../../common/config/configuration';
import { reportError } from '../../common/errors/error-reporting';
import { resolveRequestId } from '../../common/logging/request-context';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CollabAuthService } from './collab-auth.service';
import { CollabDocumentRegistry } from './collab-documents';
import { parseCollabToken, readFields, seedDocument } from './collab-yjs';

/** Ό,τι ξέρει ο server για μια σύνδεση, μετά τον έλεγχο. */
export interface CollabContext {
  requestId: string;
  userId?: string;
  user?: CollabPresenceUser;
  expiresAt?: number | null;
}

/** Το μήνυμα ενός WebSocket δεν περνά τα 2 MB (Markdown, όχι αρχεία — οι εικόνες είναι αναφορές). */
const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;
/** Πόσο πριν τη λήξη του token ο server ζητά το καινούργιο (ο client το ανανεώνει ένα λεπτό πριν). */
const TOKEN_REFRESH_LEAD_MS = 30_000;

/** Απόρριψη σύνδεσης με λόγο που καταλαβαίνει ο client (βλ. `CollabRejection`). */
function reject(reason: CollabRejection): { reason: CollabRejection } {
  return { reason };
}

/**
 * Ο server της συνεργασίας: Hocuspocus (Yjs) μέσα στη διεργασία του API, στο
 * `/api/collab` του ίδιου port.
 *
 * Το WebSocket δεν περνά από τα middleware του Express (request id, log, CORS,
 * rate limit) — γι' αυτό τα κάνει μόνο του: ελέγχει το `Origin` απέναντι στα
 * origins του CORS, γράφει μία γραμμή ανά άνοιγμα/κλείσιμο εγγράφου, και
 * κόβει τα υπερβολικά μηνύματα. Τα δικαιώματα είναι **των οντοτήτων**: κάθε
 * είδος εγγράφου (`CollabDocumentType`) ρωτά τους ίδιους κανόνες με το `GET`
 * και το `PATCH` του, και το «μόνο ανάγνωση» το επιβάλλει ο server.
 */
@Injectable()
export class CollabService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger('Collab');
  readonly registry = new CollabDocumentRegistry();
  readonly hocuspocus: Hocuspocus<CollabContext>;
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  /** Έγγραφα οντοτήτων που σβήστηκαν: δεν ξαναγράφονται από αποθήκευση που εκκρεμούσε. */
  private readonly removed = new Set<string>();
  /** Έγγραφα όπου κανείς δεν γράφει ώσπου να κληθεί `revoke` (π.χ. κατά την οριστικοποίηση). */
  private readonly frozen = new Set<string>();
  /** Ο επόμενος έλεγχος token κάθε σύνδεσης. */
  private readonly tokenTimers = new WeakMap<Connection<CollabContext>, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: CollabAuthService,
    private readonly adapterHost: HttpAdapterHost,
    @Inject(AppConfigToken) private readonly config: AppConfig,
  ) {
    const hooks: Extension<CollabContext> = {
      extensionName: 'trifylli',
      onAuthenticate: (data) => this.authenticate(data),
      onLoadDocument: (data) => this.loadDocument(data),
      onStoreDocument: (data) => this.storeDocument(data),
      // Η παρουσία δείχνει ό,τι λέει ο server για τη σύνδεση — όνομα και χρώμα
      // δεν τα διαλέγει ο client (αλλιώς γράφει όποιος «Αρχηγός» θέλει).
      beforeHandleAwareness: async ({ states, context }) => {
        if (!context?.user) return;
        for (const state of states.values()) state.user = context.user;
      },
      connected: async ({ connection, context, documentName }) => this.opened(connection, context, documentName),
      onTokenSync: ({ token, connection, context }) => this.tokenSynced(token, connection, context.userId),
      onDisconnect: async ({ context, documentName }) => {
        this.logger.log({ event: 'collab-close', document: documentName, userId: context.userId, requestId: context.requestId });
      },
      afterUnloadDocument: async ({ documentName }) => {
        this.removed.delete(documentName);
      },
    };

    this.hocuspocus = new Hocuspocus<CollabContext>({
      name: 'trifylli',
      quiet: true,
      // Σώζει 2″ μετά την τελευταία αλλαγή, το πολύ κάθε 10″ όσο γράφουν.
      debounce: 2_000,
      maxDebounce: 10_000,
      // Χωρίς μηνύματα (ούτε παρουσία) για 60″ = νεκρή σύνδεση.
      timeout: 60_000,
      // Ένα έγγραφο που μόλις άδειασε περιμένει την αποθήκευσή του πριν φύγει από
      // τη μνήμη — έτσι δεν φορτώνεται ξανά από τη βάση σε κάθε επανασύνδεση.
      unloadImmediately: false,
      extensions: [hooks],
    });
  }

  // ───────────────────────── Σύνδεση ─────────────────────────

  onApplicationBootstrap(): void {
    const server = this.adapterHost.httpAdapter.getHttpServer() as Server;
    const path = `/${this.config.API_PREFIX}/${COLLAB_PATH}`;
    const origins = new Set(corsOrigins(this.config));

    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const pathname = (req.url ?? '').split('?')[0];
      if (pathname !== path) return refuse(socket, 404);
      // Ο browser στέλνει πάντα `Origin` σε WebSocket. Χωρίς αυτόν τον έλεγχο,
      // οποιαδήποτε σελίδα θα άνοιγε σύνδεση από τον browser του χρήστη (το token
      // δεν φτάνει μόνο του σε ξένη σελίδα, αλλά ο έλεγχος μένει).
      const origin = req.headers.origin;
      if (!origin || !origins.has(origin)) return refuse(socket, 403);
      this.wss.handleUpgrade(req, socket, head, (ws) => this.accept(ws, req));
    });
    this.logger.log(`Συνεργασία: ws ${path}`);
  }

  private accept(ws: WebSocket, req: IncomingMessage): void {
    const requestId = resolveRequestId(req.headers['x-request-id']);
    // Στα hooks φτάνει μόνο το Origin — όχι cookies, όχι IP.
    const request = new Request(`http://collab${req.url ?? ''}`, {
      headers: req.headers.origin ? { origin: req.headers.origin } : {},
    });
    const client = this.hocuspocus.handleConnection(ws, request, { requestId });
    ws.on('message', (data: RawData) => client.handleMessage(toBytes(data)));
    ws.on('close', (code: number, reason: Buffer) => client.handleClose({ code, reason: reason.toString() }));
    ws.on('pong', () => client.touch());
    ws.on('error', (error: Error) => this.logger.warn({ event: 'collab-socket-error', message: error.message, requestId }));
  }

  /** Ποιος, τι, και αν γράφει — μία φορά ανά έγγραφο που ανοίγει. */
  async authenticate(data: Pick<onAuthenticatePayload<CollabContext>, 'token' | 'documentName' | 'connectionConfig'>): Promise<Partial<CollabContext>> {
    const token = parseCollabToken(data.token);
    if (!token) throw reject(CollabRejection.UNAUTHENTICATED);
    if (token.p !== COLLAB_PROTOCOL) throw reject(CollabRejection.UPDATE_REQUIRED);

    const target = this.registry.resolve(data.documentName);
    if (!target || this.removed.has(data.documentName)) throw reject(CollabRejection.FORBIDDEN);

    const identity = await this.auth.verify(token.t);
    if (!identity) throw reject(CollabRejection.UNAUTHENTICATED);
    const access = await target.type.access(identity.user, target.id);
    if (!access) throw reject(CollabRejection.FORBIDDEN);

    // Το αντίγραφο της συσκευής ενώνεται μόνο με την ίδια γενιά. Αλλιώς (ο server
    // ξαναγέμισε το έγγραφο από τη βάση) η ένωση θα έβγαζε διπλό κείμενο.
    if (token.g && token.g !== (await this.currentGeneration(data.documentName))) {
      throw reject(CollabRejection.STALE_GENERATION);
    }

    if (access === 'read' || this.frozen.has(data.documentName)) data.connectionConfig.readOnly = true;
    const { user } = identity;
    return {
      userId: user.id,
      user: {
        id: user.id,
        name: collabShortName(user.firstName, user.lastName),
        fullName: `${user.firstName} ${user.lastName}`.trim(),
        color: collabColor(user.id),
      },
      expiresAt: identity.expiresAt,
    };
  }

  private opened(connection: Connection<CollabContext>, context: CollabContext, documentName: string): void {
    this.logger.log({
      event: 'collab-open',
      document: documentName,
      userId: context.userId,
      readOnly: connection.readOnly,
      requestId: context.requestId,
    });
    this.watchToken(connection, context.expiresAt ?? null);
    connection.onClose(() => clearTimeout(this.tokenTimers.get(connection)));
  }

  /**
   * Η σύνδεση ζει όσο και το token. Λίγο πριν λήξει ο server ζητά το τρέχον token
   * του client (που το έχει ήδη ανανεώσει σιωπηλά) και συνεχίζει με αυτό· αν
   * μέχρι τη λήξη δεν έρθει έγκυρο, η σύνδεση κλείνει.
   */
  private watchToken(connection: Connection<CollabContext>, expiresAt: number | null): void {
    clearTimeout(this.tokenTimers.get(connection));
    if (!expiresAt) return;
    const closeAtExpiry = (): void => {
      const timer = setTimeout(() => connection.close({ code: 4401, reason: 'token-expired' }), Math.max(0, expiresAt - Date.now()));
      timer.unref();
      this.tokenTimers.set(connection, timer);
    };
    const askIn = expiresAt - TOKEN_REFRESH_LEAD_MS - Date.now();
    // Ήδη μέσα στο τελευταίο μισό λεπτό (ήρθε το ίδιο, παλιό token): δεν ξαναρωτά —
    // κλείνει στη λήξη, και ο client ξαναμπαίνει με όποιο token έχει τότε.
    if (askIn <= 0) return closeAtExpiry();
    const timer = setTimeout(() => {
      connection.requestToken();
      closeAtExpiry();
    }, askIn);
    timer.unref();
    this.tokenTimers.set(connection, timer);
  }

  /** Το νέο token του client: ίδιος λογαριασμός, νέα λήξη. */
  private async tokenSynced(token: string, connection: Connection<CollabContext>, userId: string | undefined): Promise<void> {
    const parsed = parseCollabToken(token);
    const identity = parsed ? await this.auth.verify(parsed.t) : null;
    if (!identity || identity.user.id !== userId) throw reject(CollabRejection.UNAUTHENTICATED);
    this.watchToken(connection, identity.expiresAt);
  }

  // ───────────────────────── Φόρτωση & αποθήκευση ─────────────────────────

  private async currentGeneration(name: string): Promise<string | null> {
    const loaded = this.hocuspocus.documents.get(name);
    if (loaded) return (loaded.getMap(COLLAB_META).get(COLLAB_GENERATION_KEY) as string | undefined) ?? null;
    const row = await this.prisma.collabDocument.findUnique({ where: { name }, select: { generation: true } });
    return row?.generation ?? null;
  }

  async loadDocument({ document, documentName }: Pick<onLoadDocumentPayload<CollabContext>, 'document' | 'documentName'>): Promise<void> {
    const target = this.registry.resolve(documentName);
    if (!target) throw reject(CollabRejection.FORBIDDEN);

    const row = await this.prisma.collabDocument.findUnique({ where: { name: documentName } });
    if (row) {
      applyUpdate(document, new Uint8Array(row.state));
      return;
    }

    // Πρώτο άνοιγμα: γεμίζει από τα σημερινά πεδία και σώζεται αμέσως, ώστε η
    // γενιά να είναι γνωστή πριν συνδεθεί δεύτερος.
    const values = await target.type.load(target.id);
    if (!values) throw reject(CollabRejection.FORBIDDEN);
    const generation = randomUUID();
    seedDocument(document, values, generation);
    await this.prisma.collabDocument.create({
      data: { name: documentName, state: Buffer.from(encodeStateAsUpdate(document)), generation },
    });
  }

  async storeDocument({ document, documentName, lastContext }: Pick<onStoreDocumentPayload<CollabContext>, 'document' | 'documentName' | 'lastContext'>): Promise<void> {
    if (this.removed.has(documentName)) return;
    const target = this.registry.resolve(documentName);
    if (!target) return;
    const generation = document.getMap(COLLAB_META).get(COLLAB_GENERATION_KEY) as string | undefined;
    if (!generation) return;

    try {
      const state = Buffer.from(encodeStateAsUpdate(document));
      await this.prisma.collabDocument.upsert({
        where: { name: documentName },
        create: { name: documentName, state, generation },
        update: { state },
      });
      await target.type.project(target.id, readFields(document, target.type.fields));
    } catch (error) {
      // Το έγγραφο μένει στη μνήμη και ξαναδοκιμάζει στην επόμενη αλλαγή.
      this.logger.error({ event: 'collab-store-failed', document: documentName, message: (error as Error).message });
      reportError(error, { userId: lastContext?.userId });
      throw error;
    }
  }

  // ───────────────────────── Για τα υπόλοιπα modules ─────────────────────────

  /** Σώζει τώρα ό,τι εκκρεμεί — πριν από οριστικοποίηση, εκτύπωση, αρχειοθέτηση. */
  async flush(name: string): Promise<void> {
    const document = this.hocuspocus.documents.get(name);
    if (document) await this.hocuspocus.storeDocumentHooks(document, this.storePayload(document), true);
  }

  /**
   * Κανείς δεν γράφει πια σε αυτό το έγγραφο ώσπου να κληθεί `revoke`, και ό,τι
   * εκκρεμεί σώζεται: ένας έλεγχος που ακολουθεί (π.χ. «υπάρχουν πρακτικά;»)
   * βλέπει το τελικό κείμενο, και τίποτα δεν γράφεται ανάμεσα.
   */
  async freeze(name: string): Promise<void> {
    this.frozen.add(name);
    for (const connection of this.hocuspocus.documents.get(name)?.getConnections() ?? []) connection.readOnly = true;
    await this.flush(name);
  }

  /** Κλείνει τις συνδέσεις ενός εγγράφου· στην επανασύνδεση ισχύουν τα νέα δικαιώματα. */
  revoke(name: string): void {
    this.frozen.delete(name);
    this.hocuspocus.closeConnections(name);
  }

  /** Η οντότητα έφυγε: σώζει ό,τι εκκρεμεί, κλείνει τις συνδέσεις και σβήνει το έγγραφο. */
  async remove(name: string): Promise<void> {
    await this.flush(name);
    this.removed.add(name);
    this.revoke(name);
    await this.prisma.collabDocument.deleteMany({ where: { name } });
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.wss.close();
    // Ό,τι γράφτηκε τα τελευταία δευτερόλεπτα σώζεται πριν σβήσει το container.
    await Promise.allSettled(
      [...this.hocuspocus.documents.values()].map((document) =>
        this.hocuspocus.storeDocumentHooks(document, this.storePayload(document), true),
      ),
    );
    this.hocuspocus.closeConnections();
  }

  private storePayload(document: Document): onStoreDocumentPayload<CollabContext> {
    return {
      instance: this.hocuspocus,
      clientsCount: document.getConnectionsCount(),
      document,
      documentName: document.name,
      lastContext: { requestId: 'server' },
      lastTransactionOrigin: undefined,
    };
  }
}

function toBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return Buffer.concat(data);
  return data instanceof ArrayBuffer ? new Uint8Array(data) : data;
}

function refuse(socket: Duplex, status: 403 | 404): void {
  const text = status === 403 ? 'Forbidden' : 'Not Found';
  socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}
