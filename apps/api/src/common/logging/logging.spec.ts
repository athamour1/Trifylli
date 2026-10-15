import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLogger } from './app-logger';
import { loggablePath, requestContext, resolveRequestId } from './request-context';

describe('resolveRequestId', () => {
  it('κρατά το id του proxy όταν είναι λογικό', () => {
    expect(resolveRequestId('req-1234abcd')).toBe('req-1234abcd');
    expect(resolveRequestId(['req-1234abcd', 'other'])).toBe('req-1234abcd');
  });

  it('αλλιώς φτιάχνει δικό του (UUID) — όχι ό,τι γράψει ο πελάτης', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(resolveRequestId(undefined)).toMatch(uuid);
    expect(resolveRequestId('short')).toMatch(uuid);
    expect(resolveRequestId('has spaces and <script>')).toMatch(uuid);
    expect(resolveRequestId('x'.repeat(200))).toMatch(uuid);
  });
});

describe('loggablePath', () => {
  it('χωρίς query string — εκεί μπορεί να υπάρχουν tokens', () => {
    expect(loggablePath('/api/draseis?klados=ODIGOI&q=Μαρία')).toBe('/api/draseis');
  });

  it('τα tokens των δημόσιων συνδέσμων γίνονται :token', () => {
    const token = 'Xq3vA9_kLm2-ZpR8tYw4bN7cF1dG6hJ0sE5uQ';
    expect(loggablePath(`/api/forms/${token}`)).toBe('/api/forms/:token');
    expect(loggablePath(`/api/review/${token}?lang=el`)).toBe('/api/review/:token');
  });

  it('τα UUID μένουν — χρειάζονται για να βρεις τι έγινε πού', () => {
    const path = '/api/draseis/1eccc9cb-c165-4347-9b58-08e6e768d3ce/schedule/bf70e6df-1bbd-4f48-a59d-3de74905c990';
    expect(loggablePath(path)).toBe(path);
  });
});

describe('AppLogger (JSON)', () => {
  afterEach(() => vi.restoreAllMocks());

  function captureLine(run: () => void): Record<string, unknown> {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    run();
    const line = String(write.mock.calls.at(-1)?.[0] ?? '');
    return JSON.parse(line) as Record<string, unknown>;
  }

  it('κάθε γραμμή μέσα σε αίτημα έχει το request id του', () => {
    const logger = new AppLogger('Test', { json: true });
    const line = captureLine(() => requestContext.run({ requestId: 'req-42' }, () => logger.log('γεια')));
    expect(line).toMatchObject({ level: 'log', context: 'Test', message: 'γεια', requestId: 'req-42' });
  });

  it('εκτός αιτήματος (cron, εκκίνηση) — χωρίς request id', () => {
    const logger = new AppLogger('Test', { json: true });
    const line = captureLine(() => logger.log('cron'));
    expect(line).not.toHaveProperty('requestId');
  });
});
