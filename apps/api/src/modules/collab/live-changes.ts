import { Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { COLLAB_CLIENT_HEADER, collabDocument } from '@trifylli/shared';
import type { Request } from 'express';
import { tap, type Observable } from 'rxjs';
import type { RequestUser } from '../../common/auth/types';
import { AppConfigToken } from '../../common/config/config.module';
import type { AppConfig } from '../../common/config/configuration';
import { CollabService } from './collab.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLIENT_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Οι οντότητες με δωμάτιο: το κομμάτι της διαδρομής πριν από το `:id` → το
 * όνομα του δωματίου και το θέμα όταν η αλλαγή αφορά την ίδια την οντότητα.
 * Η συγκέντρωση και το συμβούλιο έχουν ήδη κοινό έγγραφο — αυτό είναι και το δωμάτιο.
 */
const ROOMS: Record<string, { name: (id: string) => string; self: string }> = {
  draseis: { name: collabDocument.drasiRoom, self: 'drasi' },
  syggentrwseis: { name: collabDocument.syggentrwsh, self: 'header' },
  syggentrwsh: { name: collabDocument.syggentrwsh, self: 'header' },
  symvoulia: { name: collabDocument.symvoulio, self: 'header' },
};

/**
 * Ποιο δωμάτιο ενημερώνει μια αλλαγή, από τη διαδρομή του Express
 * (`/api/draseis/:id/schedule/:itemId`): το θέμα είναι το κομμάτι μετά το id·
 * όταν η διαδρομή ξεκινά από αλλού (`/api/parousiologio/syggentrwsh/:id`), η αρχή της.
 */
export function liveRoom(
  path: string | undefined,
  params: Record<string, unknown>,
  apiPrefix = 'api',
): { name: string; topic: string } | null {
  const id = params.id;
  if (!path || typeof id !== 'string' || !UUID.test(id)) return null;
  const prefix = apiPrefix.split('/').filter(Boolean);
  const parts = path.split('/').filter(Boolean);
  if (prefix.every((part, index) => parts[index] === part)) parts.splice(0, prefix.length);
  const at = parts.findIndex((part, index) => ROOMS[part] !== undefined && parts[index + 1] === ':id');
  if (at < 0) return null;
  const room = ROOMS[parts[at]!]!;
  const after = parts[at + 2];
  // Πριν από την οντότητα, μετά το πρόθεμα του API: η ενότητα της διαδρομής, αν υπάρχει.
  const before = parts.slice(0, at).at(-1);
  const topic = after && !after.startsWith(':') ? after : (before ?? room.self);
  return { name: room.name(id), topic };
}

/** Τι έγινε, από τη μέθοδο: νέο, αλλαγή ή αφαίρεση — η μετακίνηση είναι αλλαγή. */
export function verbOf(method: string, path: string): 'add' | 'change' | 'remove' {
  if (method === 'DELETE') return 'remove';
  if (method === 'POST' && !/\/(move|reorder|finalize)\/?$/.test(path)) return 'add';
  return 'change';
}

/**
 * Μετά από κάθε επιτυχημένη αλλαγή μέσω API, όσοι έχουν ανοιχτή τη δράση, τη
 * συγκέντρωση ή το συμβούλιο παίρνουν «άλλαξε αυτό» (βλ. `CollabChange`) και
 * ξαναφορτώνουν μόνο ό,τι τους αφορά. Ένα σημείο για όλα τα endpoints, ώστε
 * καμία νέα αλλαγή να μη μείνει «σιωπηλή».
 */
@Injectable()
export class LiveChangesInterceptor implements NestInterceptor {
  constructor(
    private readonly collab: CollabService,
    @Inject(AppConfigToken) private readonly config: AppConfig,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next.handle();
    const room = liveRoom((req.route as { path?: string } | undefined)?.path, req.params, this.config.API_PREFIX);
    if (!room) return next.handle();
    const header = req.headers[COLLAB_CLIENT_HEADER.toLowerCase()];
    const origin = typeof header === 'string' && CLIENT_ID.test(header) ? header : null;
    return next.handle().pipe(
      tap(() => this.collab.apiChanged({ room: room.name, topic: room.topic, verb: verbOf(req.method, req.path), by: req.user?.id ?? null, origin })),
    );
  }
}
