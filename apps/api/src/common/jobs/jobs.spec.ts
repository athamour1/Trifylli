import { describe, expect, it, vi } from 'vitest';

vi.mock('../errors/error-reporting', () => ({ reportError: vi.fn() }));

import { reportError } from '../errors/error-reporting';
import { heartbeatRequest, JobMonitor } from './job-monitor';

describe('heartbeatRequest', () => {
  it('Healthchecks: επιτυχία στο ίδιο URL, αποτυχία στο /fail, με το μήνυμα στο body', () => {
    expect(heartbeatRequest('https://hc-ping.com/abc', true, '3 Τοπικά')).toEqual({ url: 'https://hc-ping.com/abc', body: '3 Τοπικά' });
    expect(heartbeatRequest('https://hc-ping.com/abc/', false, 'απέτυχε')).toEqual({ url: 'https://hc-ping.com/abc/fail', body: 'απέτυχε' });
  });

  it('Uptime Kuma (/api/push/): status και msg στο query', () => {
    const ok = new URL(heartbeatRequest('https://kuma.example/api/push/tok123', true, 'ok').url);
    expect(ok.searchParams.get('status')).toBe('up');
    const fail = new URL(heartbeatRequest('https://kuma.example/api/push/tok123?ping=', false, 'Μέγαρα: timeout').url);
    expect(fail.searchParams.get('status')).toBe('down');
    expect(fail.searchParams.get('msg')).toBe('Μέγαρα: timeout');
  });
});

describe('JobMonitor', () => {
  const urls = { 'eseo-sync': 'https://hc-ping.com/eseo' } as const;

  it('καμία αποτυχία → ok, με την περίληψη', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const run = new JobMonitor(urls, send).start('eseo-sync');
    await run.finish('2 Τοπικά');
    expect(send).toHaveBeenCalledWith({ url: 'https://hc-ping.com/eseo', body: '2 Τοπικά' });
  });

  it('έστω μία αποτυχία → fail, με το τι απέτυχε, και αναφορά στο error tracking', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const run = new JobMonitor(urls, send).start('eseo-sync');
    const error = new Error('timeout');
    run.fail(error, 'Μέγαρα');
    await run.finish('2 Τοπικά');
    expect(reportError).toHaveBeenCalledWith(error, { job: 'eseo-sync' });
    expect(send).toHaveBeenCalledWith({ url: 'https://hc-ping.com/eseo/fail', body: 'Μέγαρα: timeout\n2 Τοπικά' });
  });

  it('χωρίς URL για την εργασία: κανένα ping', async () => {
    const send = vi.fn();
    await new JobMonitor({}, send).start('image-sweep').finish();
    expect(send).not.toHaveBeenCalled();
  });

  it('ένα ping που αποτυγχάνει δεν ρίχνει το cron', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network'));
    await expect(new JobMonitor(urls, send).start('eseo-sync').finish()).resolves.toBeUndefined();
  });
});
