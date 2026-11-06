import { BadRequestException } from '@nestjs/common';
import { AxiosError, type AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { SecretBox } from '../../common/util/secret-box';
import { EseoAuth } from './eseo.auth';

const config = {
  ESEO_BASE_URL: 'https://eseo.example/app/eseo',
  ESEO_REALM: 'eseo',
  ESEO_CLIENT_ID: 'ssoClient',
  DATABASE_URL: 'postgresql://u:p@db/trifylli',
} as never;

function keycloakError(error: string): AxiosError {
  return new AxiosError('400', '400', undefined, undefined, { status: 400, data: { error } } as AxiosResponse);
}

/** Keycloak ψεύτικος: δέχεται έναν κωδικό και τα refresh tokens που έχει δώσει (εκτός αν ανακληθούν). */
function setup() {
  const grants: Record<string, string>[] = [];
  const valid = new Set<string>();
  let issued = 0;
  const http = {
    post: (_url: string, body: string) => {
      const params = Object.fromEntries(new URLSearchParams(body));
      grants.push(params);
      const ok =
        (params.grant_type === 'password' && params.username === 'maria' && params.password === 'σωστός') ||
        (params.grant_type === 'refresh_token' && valid.has(params.refresh_token!));
      if (!ok) return throwError(() => keycloakError('invalid_grant'));
      const refresh = `rt-${++issued}`;
      valid.add(refresh);
      return of({ data: { access_token: `at-${issued}`, expires_in: 60, refresh_token: refresh } });
    },
  };
  let row: Record<string, unknown> | null = null;
  const prisma = {
    eseoCredential: {
      findUnique: async () => row,
      upsert: async ({ create }: { create: Record<string, unknown> }) => (row = { ...create }),
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        if (row) row = { ...row, ...data };
      },
      deleteMany: async () => (row = null),
    },
  };
  const auth = new EseoAuth(http as never, config, prisma as never);
  return { auth, grants, valid, row: () => row };
}

describe('σύνδεση στο e-SEO με όνομα και κωδικό', () => {
  it('λάθος κωδικός: 400 με ελληνικό μήνυμα, τίποτα δεν αποθηκεύεται', async () => {
    const { auth, row } = setup();
    await expect(auth.login('maria', 'λάθος', 'u-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(row()).toBeNull();
    expect(auth.configured).toBe(false);
  });

  it('ζητά offline token και αποθηκεύει κωδικό και token κρυπτογραφημένα', async () => {
    const { auth, grants, row } = setup();
    const status = await auth.login('maria', 'σωστός', 'u-1');
    expect(status).toMatchObject({ source: 'account', username: 'maria', lastError: null });
    expect(grants[0]).toMatchObject({ grant_type: 'password', scope: 'openid offline_access' });
    const saved = row()!;
    expect(saved.password).not.toContain('σωστός');
    expect(SecretBox.fromConfig(config).open(saved.password as string)).toBe('σωστός');
    expect(await auth.accessToken()).toBe('at-1');
  });

  it('μετά από επανεκκίνηση διαβάζει τον λογαριασμό από τη βάση', async () => {
    const first = setup();
    await first.auth.login('maria', 'σωστός', 'u-1');
    const restarted = new EseoAuth(
      { post: () => of({ data: { access_token: 'at-new', expires_in: 60 } }) } as never,
      config,
      { eseoCredential: { findUnique: async () => first.row() } } as never,
    );
    await restarted.onModuleInit();
    expect(restarted.configured).toBe(true);
    expect(restarted.status().username).toBe('maria');
  });

  it('ανακλήθηκε το refresh token: ξανασυνδέεται μόνο του με τον κωδικό', async () => {
    const { auth, grants, valid, row } = setup();
    await auth.login('maria', 'σωστός', 'u-1');
    valid.clear();
    (auth as unknown as { cached?: unknown }).cached = undefined;
    expect(await auth.accessToken()).toBe('at-2');
    expect(grants.map((g) => g.grant_type)).toEqual(['password', 'refresh_token', 'password']);
    // Το νέο token σώθηκε για την επόμενη φορά.
    expect(SecretBox.fromConfig(config).open(row()!.refreshToken as string)).toBe('rt-2');
  });

  it('αποσύνδεση: σβήνει τα πάντα', async () => {
    const { auth, row } = setup();
    await auth.login('maria', 'σωστός', 'u-1');
    await auth.logout();
    expect(row()).toBeNull();
    expect(auth.configured).toBe(false);
  });
});

describe('SecretBox', () => {
  it('ανοίγει μόνο με το ίδιο κλειδί', () => {
    const sealed = new SecretBox('κλειδί-ένα-αρκετά-μακρύ').seal('μυστικό');
    expect(new SecretBox('κλειδί-ένα-αρκετά-μακρύ').open(sealed)).toBe('μυστικό');
    expect(new SecretBox('άλλο-κλειδί-αρκετά-μακρύ').open(sealed)).toBeNull();
    expect(new SecretBox('x').open('σκουπίδια')).toBeNull();
  });
});
