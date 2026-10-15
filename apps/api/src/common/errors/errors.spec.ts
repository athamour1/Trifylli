import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ErrorEvent } from '@sentry/node';

vi.mock('./error-reporting', () => ({ reportError: vi.fn() }));

import { reportError } from './error-reporting';
import { AppExceptionFilter } from './app-exception.filter';
import { scrubEvent } from './scrub-event';

describe('scrubEvent', () => {
  it('μένει μόνο ό,τι χρειάζεται για να βρεις το σφάλμα — όχι δεδομένα παιδιών', () => {
    const event = {
      request: {
        method: 'POST',
        url: 'https://api.example.gr/api/forms/Xq3vA9_kLm2-ZpR8tYw4bN7cF1dG6hJ0sE5uQ?lang=el',
        data: { allergies: 'φιστίκια' },
        cookies: { a: 'b' },
        headers: { authorization: 'Bearer …' },
        query_string: 'lang=el',
      },
      user: { id: 'acc-1', email: 'maria@example.gr', ip_address: '10.0.0.7', username: 'maria' },
      breadcrumbs: [{ message: 'console: maria@example.gr' }],
      message: 'Αποτυχία για maria@example.gr',
      exception: { values: [{ type: 'Error', value: 'Δεν βρέθηκε ο maria@example.gr' }] },
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);

    expect(out.request).toEqual({ method: 'POST', url: 'https://api.example.gr/api/forms/:token' });
    expect(out.user).toEqual({ id: 'acc-1' });
    expect(out.breadcrumbs).toBeUndefined();
    expect(out.message).toBe('Αποτυχία για ***@***');
    expect(out.exception?.values?.[0]?.value).toBe('Δεν βρέθηκε ο ***@***');
  });

  it('χρήστης χωρίς id: κανένας χρήστης', () => {
    const out = scrubEvent({ user: { email: 'x@example.gr' } } as unknown as ErrorEvent);
    expect(out.user).toBeUndefined();
  });
});

describe('AppExceptionFilter', () => {
  const reply = vi.fn();
  const adapter = { reply, isHeadersSent: () => false, end: vi.fn() };
  const filter = new AppExceptionFilter(adapter as never);

  function host(user?: { id: string }) {
    const response = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const request = { user };
    const argumentsHost = {
      getType: () => 'http',
      getArgs: () => [request, response],
      getArgByIndex: (i: number) => [request, response][i],
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    } as unknown as ArgumentsHost;
    return { argumentsHost, response };
  }

  beforeEach(() => {
    vi.mocked(reportError).mockClear();
    reply.mockClear();
  });

  it('σφάλμα του πελάτη (4xx): απάντηση όπως πριν, καμία αναφορά', () => {
    filter.catch(new BadRequestException('λάθος'), host().argumentsHost);
    expect(reportError).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ statusCode: 400 }), 400);
  });

  it('Prisma P2002 → 409 από το φίλτρο της Prisma, καμία αναφορά', () => {
    const { argumentsHost, response } = host();
    const error = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x', meta: { target: ['email'] } });
    filter.catch(error, argumentsHost);
    expect(response.status).toHaveBeenCalledWith(409);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('άγνωστο σφάλμα Prisma → 500 και αναφορά', () => {
    const { argumentsHost, response } = host({ id: 'acc-1' });
    const error = new Prisma.PrismaClientKnownRequestError('boom', { code: 'P2010', clientVersion: 'x' });
    filter.catch(error, argumentsHost);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(reportError).toHaveBeenCalledWith(error, { userId: 'acc-1' });
  });

  it('απρόβλεπτο σφάλμα → 500 και αναφορά με τον χρήστη', () => {
    const error = new Error('κάτι έσπασε');
    filter.catch(error, host({ id: 'acc-2' }).argumentsHost);
    expect(reportError).toHaveBeenCalledWith(error, { userId: 'acc-2' });
    expect(reply).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ statusCode: 500 }), 500);
  });
});
