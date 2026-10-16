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
  type CollabChange,
  type CollabPresenceUser,
} from '@trifylli/shared';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { applyUpdate, encodeStateAsUpdate, type Doc } from 'yjs';
import { AppConfigToken } from '../../common/config/config.module';
import { corsOrigins, type AppConfig } from '../../common/config/configuration';
import { reportError } from '../../common/errors/error-reporting';
import { resolveRequestId } from '../../common/logging/request-context';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { CollabAuthService } from './collab-auth.service';
import { CollabDocumentRegistry, type CollabAccess, type CollabDocumentType } from './collab-documents';
import { documentSchema, parseCollabToken, stampGeneration, stampSchema } from './collab-yjs';
import { COLLAB_LIMITS, MessageBudget } from './collab-limits';

/** Μια αλλαγή μέσω API, όπως τη βλέπει το `LiveChangesInterceptor`. */
export interface ApiChange {
  /** Το δωμάτιο (ή κοινό έγγραφο) της οντότητας. */
  room: string;
  topic: string;
  /** `add`, `change` ή `remove` — από τη μέθοδο του αιτήματος. */
  verb: 'add' | 'change' | 'remove';
  by: string | null;
  origin: string | null;
  /** Φτάνει ζωντανά, αλλά δεν είναι δραστηριότητα (βλ. `QuietChange`). */
  quiet?: boolean;
}

/** Ό,τι ξέρει ο server για μια σύνδεση, μετά τον έλεγχο. */
export interface CollabContext {
  requestId: string;
  userId?: string;
  user?: CollabPresenceUser;
  expiresAt?: number | null;
}

/** Το μήνυμα ενός WebSocket δεν περνά τα 2 MB (Markdown, όχι αρχεία — οι εικόνες είναι αναφορές). */
const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;
/** Κάθε πότε γράφεται η γραμμή `collab-stats` στο log. */
const STATS_EVERY_MS = 5 * 60_000;
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
  /** Έγγραφα (ή προθέματα, π.χ. όλη μια δράση) οντοτήτων που σβήστηκαν: δεν ξαναγράφονται από αποθήκευση που εκκρεμούσε. */
  private readonly removed = new Set<string>();
  /** Έγγραφα όπου κανείς δεν γράφει ώσπου να κληθεί `revoke` (π.χ. κατά την οριστικοποίηση). */
  private readonly frozen = new Set<string>();
  /** Ο επόμενος έλεγχος token κάθε σύνδεσης. */
  private readonly tokenTimers = new WeakMap<Connection<CollabContext>, ReturnType<typeof setTimeout>>();
  /** Τα ανοιχτά έγγραφα κάθε socket (καρτέλας) — για το όριο `documentsPerSocket`. */
  private readonly socketDocuments = new Map<string, Set<string>>();
  /** Έγγραφα που ξεπέρασαν το όριο μεγέθους: μένουν μόνο για ανάγνωση (ώσπου να ξεκινήσει ξανά ο server). */
  private readonly oversized = new Set<string>();
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  /** Όσοι έγραψαν σε κάθε έγγραφο από την τελευταία αποθήκευση. */
  private readonly writers = new Map<string, Set<string>>();
  /** Όσοι θέλουν να ξέρουν ποιος έγραψε (π.χ. η ροή δραστηριότητας της δράσης). */
  private readonly writtenListeners = new Set<(name: string, writers: ReadonlySet<string>) => void>();
  /** Όσοι θέλουν να ξέρουν τις αλλαγές μέσω API (βλ. `apiChanged`). */
  private readonly apiListeners = new Set<(change: ApiChange) => void>();
  /** Όσοι κρατούν κάτι για τα έγγραφα έξω από αυτά (σχόλια, εκδόσεις): σβήνουν μαζί τους. */
  private readonly removedListeners = new Set<(name: string, prefix: boolean) => Promise<void>>();
  /** Όσοι θέλουν να ξέρουν πότε ένα έγγραφο άδειασε (έφυγε και ο τελευταίος). */
  private readonly idleListeners = new Set<(name: string) => void>();
  /** Όσοι κρατούν ορόσημα (το ιστορικό εκδόσεων). */
  private readonly milestoneListeners = new Set<(name: string, label: string) => Promise<void>>();
  /** Τα όρια (βλ. `COLLAB_LIMITS`) — αλλάζουν μόνο στις δοκιμές. */
  limits: { messages: { burst: number; perSecond: number }; documentsPerSocket: number; documentBytes: number } = { ...COLLAB_LIMITS };

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
      // Ποιος έγραψε τι, ως την επόμενη αποθήκευση (για τη ροή δραστηριότητας).
      onChange: async ({ documentName, context }) => {
        if (!context?.userId) return;
        const writers = this.writers.get(documentName) ?? new Set<string>();
        writers.add(context.userId);
        this.writers.set(documentName, writers);
      },
      // Η παρουσία δείχνει ό,τι λέει ο server για τη σύνδεση — όνομα και χρώμα
      // δεν τα διαλέγει ο client (αλλιώς γράφει όποιος «Αρχηγός» θέλει).
      beforeHandleAwareness: async ({ states, context }) => {
        if (!context?.user) return;
        for (const state of states.values()) state.user = context.user;
      },
      connected: async ({ connection, context, documentName, socketId }) => this.opened(connection, context, documentName, socketId),
      // Έφυγε και ο τελευταίος: για το ιστορικό, η στιγμή να κρατηθεί έκδοση.
      onDisconnect: async ({ documentName, clientsCount }) => {
        if (clientsCount === 0) for (const listener of this.idleListeners) listener(documentName);
      },
      onTokenSync: ({ token, connection, context }) => this.tokenSynced(token, connection, context.userId),
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
    // Μία γραμμή στο log κάθε 5΄ όσο υπάρχει κίνηση: πόσα έγγραφα ζουν στη μνήμη,
    // πόσες συνδέσεις, πόση μνήμη τρώει η διεργασία — για το όριο μνήμης του container.
    this.statsTimer = setInterval(() => {
      const stats = this.stats();
      if (!stats.connections) return;
      const memory = process.memoryUsage();
      this.logger.log({ event: 'collab-stats', ...stats, rssMb: Math.round(memory.rss / 1048576), heapMb: Math.round(memory.heapUsed / 1048576) });
    }, STATS_EVERY_MS);
    this.statsTimer.unref();
  }

  /**
   * Ποιοι είναι τώρα σε ένα έγγραφο ή δωμάτιο — ένας ανά άτομο, όπως τους
   * σφραγίζει ο server (όνομα και χρώμα από τον λογαριασμό). Για τις κάρτες της
   * αρχικής, που δεν ανοίγουν σύνδεση για κάθε δράση.
   */
  presence(name: string): CollabPresenceUser[] {
    const document = this.hocuspocus.documents.get(name);
    if (!document) return [];
    const byId = new Map<string, CollabPresenceUser>();
    for (const state of document.awareness.getStates().values()) {
      const user = (state as { user?: CollabPresenceUser }).user;
      if (user?.id) byId.set(user.id, user);
    }
    return [...byId.values()];
  }

  /** Τι ζει τώρα στη μνήμη: ανοιχτά έγγραφα, συνδέσεις σε αυτά, sockets (καρτέλες). */
  stats(): { documents: number; connections: number; sockets: number } {
    let connections = 0;
    for (const document of this.hocuspocus.documents.values()) connections += document.getConnectionsCount();
    return { documents: this.hocuspocus.documents.size, connections, sockets: this.wss.clients.size };
  }

  private accept(ws: WebSocket, req: IncomingMessage): void {
    const requestId = resolveRequestId(req.headers['x-request-id']);
    // Στα hooks φτάνει μόνο το Origin — όχι cookies, όχι IP.
    const request = new Request(`http://collab${req.url ?? ''}`, {
      headers: req.headers.origin ? { origin: req.headers.origin } : {},
    });
    const client = this.hocuspocus.handleConnection(ws, request, { requestId });
    // Πλημμύρα μηνυμάτων (όχι άνθρωπος που γράφει): κλείνει. Ο client ξανασυνδέεται
    // και συγχρονίζεται από την αρχή — ένα μήνυμα που απλώς πετιέται θα χαλούσε τον συγχρονισμό.
    const budget = new MessageBudget(this.limits.messages);
    ws.on('message', (data: RawData) => {
      if (budget.take()) return client.handleMessage(toBytes(data));
      this.logger.warn({ event: 'collab-rate-limit', requestId });
      ws.close(4429, 'rate-limit');
    });
    ws.on('close', (code: number, reason: Buffer) => client.handleClose({ code, reason: reason.toString() }));
    ws.on('pong', () => client.touch());
    ws.on('error', (error: Error) => this.logger.warn({ event: 'collab-socket-error', message: error.message, requestId }));
  }

  /** Ποιος, τι, και αν γράφει — μία φορά ανά έγγραφο που ανοίγει. */
  async authenticate(
    data: Pick<onAuthenticatePayload<CollabContext>, 'token' | 'documentName' | 'connectionConfig' | 'context' | 'socketId'>,
  ): Promise<Partial<CollabContext>> {
    const refuse = (reason: CollabRejection, userId?: string) => {
      this.logger.log({ event: 'collab-reject', document: data.documentName, reason, userId, requestId: data.context?.requestId });
      return reject(reason);
    };
    const token = parseCollabToken(data.token);
    if (!token) throw refuse(CollabRejection.UNAUTHENTICATED);
    if (token.p !== COLLAB_PROTOCOL) throw refuse(CollabRejection.UPDATE_REQUIRED);

    const target = this.registry.resolve(data.documentName);
    if (!target || this.isRemoved(data.documentName)) throw refuse(CollabRejection.FORBIDDEN);
    const open = this.socketDocuments.get(data.socketId);
    if (open && !open.has(data.documentName) && open.size >= this.limits.documentsPerSocket) {
      throw refuse(CollabRejection.FORBIDDEN);
    }

    const identity = await this.auth.verify(token.t);
    if (identity === 'no-access') throw refuse(CollabRejection.FORBIDDEN);
    if (identity === 'invalid') throw refuse(CollabRejection.UNAUTHENTICATED);
    const access = await target.type.access(identity.user, target.ids);
    if (!access) throw refuse(CollabRejection.FORBIDDEN, identity.user.id);

    // Το αντίγραφο της συσκευής ενώνεται μόνο με την ίδια γενιά. Αλλιώς (ο server
    // ξαναγέμισε το έγγραφο από τη βάση) η ένωση θα έβγαζε διπλό κείμενο.
    if (token.g && token.g !== (await this.currentGeneration(data.documentName))) {
      throw refuse(CollabRejection.STALE_GENERATION, identity.user.id);
    }

    if (access === 'read' || target.type.room || this.frozen.has(data.documentName) || this.oversized.has(data.documentName)) {
      data.connectionConfig.readOnly = true;
    }
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

  private opened(connection: Connection<CollabContext>, context: CollabContext, documentName: string, socketId: string): void {
    const open = this.socketDocuments.get(socketId) ?? new Set<string>();
    open.add(documentName);
    this.socketDocuments.set(socketId, open);
    connection.onClose(() => {
      open.delete(documentName);
      if (!open.size) this.socketDocuments.delete(socketId);
    });
    this.logger.log({
      event: 'collab-open',
      document: documentName,
      userId: context.userId,
      readOnly: connection.readOnly,
      requestId: context.requestId,
    });
    this.watchToken(connection, context.expiresAt ?? null);
    connection.onClose((_document, event) => {
      clearTimeout(this.tokenTimers.get(connection));
      this.logger.log({
        event: 'collab-close',
        document: documentName,
        userId: context.userId,
        reason: event?.reason,
        requestId: context.requestId,
      });
    });
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
    const identity = parsed ? await this.auth.verify(parsed.t) : 'invalid';
    if (typeof identity === 'string' || identity.user.id !== userId) throw reject(CollabRejection.UNAUTHENTICATED);
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

    // Δωμάτιο: κανένα περιεχόμενο να φορτωθεί ή να σωθεί.
    if (target.type.room) return;

    const row = await this.prisma.collabDocument.findUnique({ where: { name: documentName } });
    if (row) {
      applyUpdate(document, new Uint8Array(row.state));
      await this.upgrade(document, documentName, target.type, target.ids);
      return;
    }

    // Πρώτο άνοιγμα: γεμίζει από τα σημερινά πεδία και σώζεται αμέσως, ώστε η
    // γενιά να είναι γνωστή πριν συνδεθεί δεύτερος.
    if (!(await target.type.seed(document, target.ids))) throw reject(CollabRejection.FORBIDDEN);
    const generation = randomUUID();
    stampGeneration(document, generation);
    stampSchema(document, target.type.schema ?? 1);
    await this.prisma.collabDocument.create({
      data: { name: documentName, state: Buffer.from(encodeStateAsUpdate(document)), generation },
    });
  }

  /**
   * Σωσμένο έγγραφο παλιότερης δομής: τα πεδία που ήρθαν μετά γεμίζουν από τη
   * βάση — πριν το δει κανείς — και σώζεται αμέσως, ώστε να γίνει μία φορά.
   */
  private async upgrade(document: Doc, name: string, type: CollabDocumentType, ids: readonly string[]): Promise<void> {
    const wanted = type.schema ?? 1;
    const current = documentSchema(document);
    if (current >= wanted || !type.upgrade) return;
    if (!(await type.upgrade(document, ids, current))) throw reject(CollabRejection.FORBIDDEN);
    stampSchema(document, wanted);
    await this.prisma.collabDocument.update({ where: { name }, data: { state: Buffer.from(encodeStateAsUpdate(document)) } });
    this.logger.log({ event: 'collab-upgrade', document: name, from: current, to: wanted });
  }

  async storeDocument({ document, documentName, lastContext }: Pick<onStoreDocumentPayload<CollabContext>, 'document' | 'documentName' | 'lastContext'>): Promise<void> {
    if (this.isRemoved(documentName)) return;
    const target = this.registry.resolve(documentName);
    if (!target || target.type.room) return;
    const generation = document.getMap(COLLAB_META).get(COLLAB_GENERATION_KEY) as string | undefined;
    if (!generation) return;

    try {
      const state = Buffer.from(encodeStateAsUpdate(document));
      if (state.byteLength > this.limits.documentBytes && !this.oversized.has(documentName)) this.tooLarge(documentName, state.byteLength);
      await this.prisma.collabDocument.upsert({
        where: { name: documentName },
        create: { name: documentName, state, generation },
        update: { state },
      });
      await target.type.project(document, target.ids);
      const writers = this.writers.get(documentName);
      if (writers?.size) {
        this.writers.delete(documentName);
        for (const listener of this.writtenListeners) listener(documentName, writers);
      }
    } catch (error) {
      // Το έγγραφο μένει στη μνήμη και ξαναδοκιμάζει στην επόμενη αλλαγή.
      this.logger.error({ event: 'collab-store-failed', document: documentName, message: (error as Error).message });
      reportError(error, { userId: lastContext?.userId });
      throw error;
    }
  }

  /**
   * Το έγγραφο ξεπέρασε το όριο μεγέθους: ό,τι έχει σώζεται, αλλά από εδώ και
   * πέρα μόνο διαβάζεται — οι συνδέσεις ξανανοίγουν και το μαθαίνουν. Δεν
   * συμβαίνει με κανονική χρήση (Markdown, εικόνες ως αναφορές): είναι σφάλμα ή
   * κατάχρηση, και πάει στο GlitchTip — χωρίς περιεχόμενο.
   */
  private tooLarge(documentName: string, bytes: number): void {
    this.oversized.add(documentName);
    this.logger.warn({ event: 'collab-too-large', document: documentName, bytes });
    reportError(new Error(`Κοινό έγγραφο πάνω από το όριο μεγέθους (${bytes} bytes)`), {});
    this.hocuspocus.closeConnections(documentName);
  }

  // ───────────────────────── Για τα υπόλοιπα modules ─────────────────────────

  /**
   * Τι επιτρέπεται σε αυτόν τον χρήστη σε αυτό το έγγραφο — ο ίδιος κανόνας με τη
   * σύνδεση. Για ό,τι κρέμεται από ένα έγγραφο έξω από αυτό (π.χ. οι εικόνες του).
   */
  async documentAccess(user: RequestUser, name: string): Promise<CollabAccess | null> {
    const target = this.registry.resolve(name);
    if (!target || this.isRemoved(name)) return null;
    return target.type.access(user, target.ids);
  }

  /** Υπάρχει (σωσμένο) το κοινό έγγραφο; */
  async documentExists(name: string): Promise<boolean> {
    if (this.hocuspocus.documents.has(name)) return true;
    return (await this.prisma.collabDocument.count({ where: { name } })) > 0;
  }

  /** Σώζει τώρα ό,τι εκκρεμεί — πριν από οριστικοποίηση, εκτύπωση, αρχειοθέτηση. */
  async flush(name: string): Promise<void> {
    const document = this.hocuspocus.documents.get(name);
    if (document) await this.hocuspocus.storeDocumentHooks(document, this.storePayload(document), true);
  }

  /**
   * Πριν από μια ανάγνωση της βάσης (`GET`, ντοσιέ, εκτύπωση): ό,τι γράφτηκε στα
   * ανοιχτά έγγραφα με αυτό το πρόθεμα και περιμένει την αποθήκευσή του (έως 10″)
   * σώζεται τώρα, ώστε η απάντηση να έχει το τελευταίο κείμενο. Τα υπόλοιπα δεν
   * αγγίζονται — χωρίς εκκρεμότητα δεν κοστίζει τίποτα.
   */
  async flushPending(prefix: string): Promise<void> {
    const pending = [...this.hocuspocus.documents.keys()].filter(
      (name) => name.startsWith(prefix) && this.hocuspocus.debouncer.isDebounced(`onStoreDocument-${name}`),
    );
    await Promise.all(pending.map((name) => this.hocuspocus.debouncer.executeNow(`onStoreDocument-${name}`)));
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

  /**
   * «Άλλαξε αυτό» σε όσους έχουν ανοιχτό το έγγραφο ή το δωμάτιο (βλ.
   * `LiveChangesInterceptor`). Αν δεν το έχει ανοιχτό κανείς, δεν γίνεται τίποτα.
   */
  broadcast(name: string, change: CollabChange): void {
    this.hocuspocus.documents.get(name)?.broadcastStateless(JSON.stringify(change));
  }

  /** Μια αλλαγή μέσω API: πάει στο δωμάτιό της και σε όσους την παρακολουθούν (ροή δραστηριότητας). */
  apiChanged(change: ApiChange): void {
    this.broadcast(change.room, { topic: change.topic, by: change.by, origin: change.origin, ...(change.quiet ? { quiet: true } : {}) });
    for (const listener of this.apiListeners) listener(change);
  }

  /** Ακούει τις αλλαγές μέσω API (βλ. `apiChanged`). */
  onApiChange(listener: (change: ApiChange) => void): void {
    this.apiListeners.add(listener);
  }

  /** Ακούει τα έγγραφα που άδειασαν (έφυγε και η τελευταία σύνδεση). */
  onDocumentIdle(listener: (name: string) => void): void {
    this.idleListeners.add(listener);
  }

  /** Ακούει τα ορόσημα (βλ. `milestone`). */
  onMilestone(listener: (name: string, label: string) => Promise<void>): void {
    this.milestoneListeners.add(listener);
  }

  /**
   * Ορόσημο ενός εγγράφου — «Οριστικοποίηση», «Εγκρίθηκε», «Κλειστή δράση»: το
   * ιστορικό κρατά έκδοση τώρα, με αυτή την ετικέτα. Αποτυχία δεν σταματά την
   * πράξη που το ζήτησε.
   */
  async milestone(name: string, label: string): Promise<void> {
    await Promise.all([...this.milestoneListeners].map((listener) => listener(name, label).catch((error: Error) => {
      this.logger.warn({ event: 'collab-milestone-failed', document: name, message: error.message });
    })));
  }

  /** Το ίδιο για όλα τα (σωσμένα ή ανοιχτά) έγγραφα με αυτό το πρόθεμα — π.χ. μια δράση που κλείνει. */
  async milestoneAll(prefix: string, label: string): Promise<void> {
    const saved = await this.prisma.collabDocument.findMany({ where: { name: { startsWith: prefix } }, select: { name: true } });
    const names = new Set([...saved.map((row) => row.name), ...[...this.hocuspocus.documents.keys()].filter((name) => name.startsWith(prefix))]);
    for (const name of names) await this.milestone(name, label);
  }

  /** Γράφεται ακόμα; Όχι αν σβήστηκε, πάγωσε ή ξεπέρασε το όριο μεγέθους. */
  isWritable(name: string): boolean {
    return !this.isRemoved(name) && !this.frozen.has(name) && !this.oversized.has(name);
  }

  /** Ακούει τα έγγραφα που σβήνονται (`name` ή, με `prefix`, όλα όσα αρχίζουν έτσι). */
  onRemoved(listener: (name: string, prefix: boolean) => Promise<void>): void {
    this.removedListeners.add(listener);
  }

  /** Ακούει ποιοι έγραψαν σε ένα έγγραφο, μετά από κάθε αποθήκευσή του. */
  onDocumentWritten(listener: (name: string, writers: ReadonlySet<string>) => void): void {
    this.writtenListeners.add(listener);
  }

  /** Κλείνει τις συνδέσεις ενός εγγράφου· στην επανασύνδεση ισχύουν τα νέα δικαιώματα. */
  revoke(name: string): void {
    this.frozen.delete(name);
    this.hocuspocus.closeConnections(name);
  }

  /**
   * Άλλαξε ο λογαριασμός (ρόλος, ευθύνες, ανάκληση πρόσβασης): κλείνουν οι
   * συνδέσεις του σε όλα τα έγγραφα και ξανανοίγουν με τα νέα δικαιώματα — ή δεν
   * ξανανοίγουν. Χωρίς αυτό θα έγραφε με τα παλιά ώσπου να λήξει το token.
   */
  revokeUser(userId: string): void {
    for (const document of this.hocuspocus.documents.values()) {
      for (const connection of document.getConnections()) {
        if ((connection.context as CollabContext | undefined)?.userId === userId) {
          connection.close({ code: 4403, reason: 'access-changed' });
        }
      }
    }
  }

  /**
   * Το ίδιο για όλα τα ανοιχτά έγγραφα με αυτό το πρόθεμα — π.χ. όταν αλλάζουν οι
   * ρόλοι ή οι συμμετέχοντες μιας δράσης (`collabDocument.drasiPrefix`).
   */
  revokeAll(prefix: string): void {
    for (const name of this.hocuspocus.documents.keys()) if (name.startsWith(prefix)) this.revoke(name);
  }

  /** Η οντότητα έφυγε: σώζει ό,τι εκκρεμεί, κλείνει τις συνδέσεις και σβήνει το έγγραφο. */
  async remove(name: string): Promise<void> {
    await this.flush(name);
    this.removed.add(name);
    this.revoke(name);
    await this.prisma.collabDocument.deleteMany({ where: { name } });
    await Promise.all([...this.removedListeners].map((listener) => listener(name, false)));
  }

  /** Το ίδιο για όλα τα έγγραφα με αυτό το πρόθεμα — π.χ. μια δράση που σβήνεται. */
  async removeAll(prefix: string): Promise<void> {
    const loaded = [...this.hocuspocus.documents.keys()].filter((name) => name.startsWith(prefix));
    await Promise.all(loaded.map((name) => this.flush(name)));
    this.removed.add(prefix);
    for (const name of loaded) this.revoke(name);
    await this.prisma.collabDocument.deleteMany({ where: { name: { startsWith: prefix } } });
    await Promise.all([...this.removedListeners].map((listener) => listener(prefix, true)));
  }

  private isRemoved(name: string): boolean {
    for (const removed of this.removed) if (name === removed || (removed.endsWith(':') && name.startsWith(removed))) return true;
    return false;
  }

  async beforeApplicationShutdown(): Promise<void> {
    if (this.statsTimer) clearInterval(this.statsTimer);
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
