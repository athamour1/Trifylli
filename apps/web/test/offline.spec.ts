import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Η ουρά offline είναι το σημείο όπου χάνονται δεδομένα αν κάτι πάει στραβά,
 * οπότε ελέγχονται ρητά οι τρεις κανόνες της:
 *  * σφάλμα δικτύου ⇒ η εγγραφή μπαίνει στην ουρά, χωρίς χρέωση προσπάθειας·
 *  * 4xx ⇒ μόνιμη αποτυχία, καμία επανάληψη·
 *  * 5xx ⇒ επανάληψη με μετρητή.
 */

const store = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(store.get(key))),
  set: vi.fn((key: string, value: unknown) => {
    store.set(key, value);
    return Promise.resolve();
  }),
  del: vi.fn((key: string) => {
    store.delete(key);
    return Promise.resolve();
  }),
}));

vi.mock('quasar', () => ({ Notify: { create: vi.fn() } }));

const request = vi.fn();

vi.mock('../src/lib/api', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/api')>('../src/lib/api');
  return { ...actual, http: { request } };
});

const { useOfflineStore } = await import('../src/stores/offline');
const { ApiError, OfflineError } = await import('../src/lib/api');

describe('offline outbox', () => {
  beforeEach(() => {
    store.clear();
    request.mockReset();
    setActivePinia(createPinia());
  });

  it('στέλνει άμεσα όταν υπάρχει δίκτυο', async () => {
    request.mockResolvedValue({ data: { written: 3 } });
    const offline = useOfflineStore();
    offline.online = true;

    const result = await offline.submit('PUT', '/parousiologio/syggentrwsh/1', { entries: [] });

    expect(result.queued).toBe(false);
    expect(result.data).toEqual({ written: 3 });
    expect(offline.outbox).toHaveLength(0);
  });

  it('βάζει στην ουρά όταν χαθεί το δίκτυο κατά την αποστολή', async () => {
    request.mockRejectedValue(new OfflineError());
    const offline = useOfflineStore();
    offline.online = true;

    const result = await offline.submit('PUT', '/parousiologio/syggentrwsh/1', { entries: [] });

    expect(result.queued).toBe(true);
    expect(offline.outbox).toHaveLength(1);
    expect(offline.online).toBe(false);
  });

  it('προωθεί τα σφάλματα του server αντί να τα κρύβει στην ουρά', async () => {
    request.mockRejectedValue(new ApiError('Δεν έχετε δικαίωμα.', 403));
    const offline = useOfflineStore();
    offline.online = true;

    await expect(
      offline.submit('POST', '/yliko/checkouts', { qty: 1 }),
    ).rejects.toThrow('Δεν έχετε δικαίωμα.');
    expect(offline.outbox).toHaveLength(0);
  });

  it('αδειάζει την ουρά όταν επιστρέψει το δίκτυο', async () => {
    const offline = useOfflineStore();
    offline.online = false;
    await offline.enqueue({ method: 'PUT', url: '/a', body: {} });
    await offline.enqueue({ method: 'PUT', url: '/b', body: {} });

    request.mockResolvedValue({ data: {} });
    offline.online = true;
    await offline.flush();

    expect(request).toHaveBeenCalledTimes(2);
    expect(offline.outbox).toHaveLength(0);
  });

  it('με `replace`, η νέα εκδοχή διώχνει την προηγούμενη της ίδιας οθόνης', async () => {
    const offline = useOfflineStore();
    offline.online = false;

    // Μια οθόνη που αποθηκεύει μόνη της στέλνει ολόκληρο το φύλλο σε κάθε παύση.
    await offline.submit('PUT', '/parousiologio/syggentrwsh/1', { entries: ['α'] }, { replace: true });
    await offline.submit('PUT', '/parousiologio/syggentrwsh/1', { entries: ['α', 'β'] }, { replace: true });
    await offline.submit('PUT', '/parousiologio/syggentrwsh/1', { entries: ['α', 'β', 'γ'] }, { replace: true });

    expect(offline.outbox).toHaveLength(1);
    expect(offline.outbox[0]?.body).toEqual({ entries: ['α', 'β', 'γ'] });
  });

  it('το `replace` δεν αγγίζει άλλη διεύθυνση ούτε άλλη οθόνη', async () => {
    const offline = useOfflineStore();
    offline.online = false;

    await offline.submit('PUT', '/parousiologio/syggentrwsh/1', { n: 1 }, { replace: true });
    await offline.submit('PUT', '/parousiologio/syggentrwsh/2', { n: 2 }, { replace: true });
    await offline.submit('POST', '/yliko/checkouts', { n: 3 });
    await offline.submit('PUT', '/parousiologio/syggentrwsh/1', { n: 4 }, { replace: true });

    expect(offline.outbox.map((item) => item.body)).toEqual([{ n: 2 }, { n: 3 }, { n: 4 }]);
  });

  it('το `replace` αφήνει ανέπαφη μια εγγραφή που έχει ήδη αποτύχει', async () => {
    const offline = useOfflineStore();
    offline.online = true;
    await offline.enqueue({ method: 'PUT', url: '/p', body: { n: 1 } });

    request.mockRejectedValue(new ApiError('Σφάλμα διακομιστή.', 500));
    await offline.flush();
    expect(offline.outbox[0]?.attempts).toBe(1);

    // Η αποτυχημένη μένει: το σφάλμα της πρέπει να φτάσει στον χρήστη αντί να
    // εξαφανιστεί επειδή η οθόνη έστειλε μια νεότερη εκδοχή.
    offline.online = false;
    await offline.submit('PUT', '/p', { n: 2 }, { replace: true });

    expect(offline.outbox).toHaveLength(2);
  });

  it('δεν ξαναδοκιμάζει ένα 4xx — θα κολλούσε η ουρά για πάντα', async () => {
    const offline = useOfflineStore();
    offline.online = true;
    await offline.enqueue({ method: 'PUT', url: '/a', body: {} });

    request.mockRejectedValue(new ApiError('Άκυρο payload.', 400));
    await offline.flush();

    expect(offline.outbox).toHaveLength(1);
    expect(offline.failed).toHaveLength(1);
    expect(offline.pending).toBe(0);
    expect(offline.outbox[0]?.lastError).toBe('Άκυρο payload.');
  });

  it('ξαναδοκιμάζει ένα 5xx μετρώντας προσπάθειες', async () => {
    const offline = useOfflineStore();
    offline.online = true;
    await offline.enqueue({ method: 'PUT', url: '/a', body: {} });

    request.mockRejectedValue(new ApiError('Σφάλμα διακομιστή.', 500));
    await offline.flush();

    expect(offline.outbox[0]?.attempts).toBe(1);
    expect(offline.pending).toBe(1);
  });

  it('η απώλεια δικτύου στη μέση δεν χρεώνει προσπάθειες στις υπόλοιπες', async () => {
    const offline = useOfflineStore();
    offline.online = true;
    await offline.enqueue({ method: 'PUT', url: '/a', body: {} });
    await offline.enqueue({ method: 'PUT', url: '/b', body: {} });
    await offline.enqueue({ method: 'PUT', url: '/c', body: {} });

    request
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce(new OfflineError())
      .mockResolvedValue({ data: {} });

    await offline.flush();

    expect(offline.online).toBe(false);
    expect(offline.outbox.map((i) => i.url)).toEqual(['/b', '/c']);
    expect(offline.outbox.every((i) => i.attempts === 0)).toBe(true);
  });

  it('η απόρριψη βγάζει την εγγραφή οριστικά', async () => {
    const offline = useOfflineStore();
    await offline.enqueue({ method: 'PUT', url: '/a', body: {} });
    const id = offline.outbox[0]!.id;

    await offline.discard(id);

    expect(offline.outbox).toHaveLength(0);
  });
});
