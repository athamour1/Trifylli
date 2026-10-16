import type { CommentAnchor, CommentPerson, CommentThreadView } from '@trifylli/shared';
import { onBeforeUnmount, ref, type Ref } from 'vue';
import { del, get, patch, post } from '../lib/api';
import { CLIENT_ID } from '../lib/client-id';
import { onDocumentChange } from './useCollabDoc';

interface Shared {
  threads: Ref<CommentThreadView[]>;
  loaded: Ref<boolean>;
  people: Ref<CommentPerson[] | null>;
  users: number;
  load: () => Promise<void>;
  stop: () => void;
}

/** Ένα αντίγραφο ανά έγγραφο: δύο πεδία του ίδιου εγγράφου (ατζέντα, πρακτικά) φορτώνουν μία φορά. */
const shared = new Map<string, Shared>();

function open(document: string): Shared {
  const existing = shared.get(document);
  if (existing) return existing;
  const threads = ref<CommentThreadView[]>([]);
  const loaded = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const load = async (): Promise<void> => {
    try {
      threads.value = await get<CommentThreadView[]>('/comments', { params: { document } });
      loaded.value = true;
    } catch {
      // Χωρίς δίκτυο ή χωρίς πρόσβαση: μένουν όσα ξέρουμε.
    }
  };
  // Ζωντανά: ό,τι αλλάζει κάποιος άλλος (ή μετά από διακοπή, «*»). Οι δικές μας
  // αλλαγές φορτώνονται μετά την απάντηση του server.
  const stop = onDocumentChange(document, (change) => {
    if (change.origin === CLIENT_ID || (change.topic !== 'comments' && change.topic !== '*')) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void load(), 150);
  });
  const entry: Shared = { threads, loaded, people: ref(null), users: 0, load, stop };
  shared.set(document, entry);
  void load();
  return entry;
}

/**
 * Τα σχόλια ενός κοινού εγγράφου: τα νήματα (ζωντανά), τα στελέχη για τις
 * @αναφορές, και οι πράξεις. Κάθε πράξη ξαναφορτώνει τη λίστα μόλις απαντήσει
 * ο server· αποτυχία = εξαίρεση, για να μη χαθεί ό,τι γράφτηκε.
 */
export function useComments(document: string) {
  const entry = open(document);
  entry.users += 1;
  onBeforeUnmount(() => {
    entry.users -= 1;
    if (entry.users) return;
    entry.stop();
    shared.delete(document);
  });

  async function loadPeople(): Promise<CommentPerson[]> {
    if (entry.people.value) return entry.people.value;
    try {
      entry.people.value = await get<CommentPerson[]>('/comments/people', { params: { document } });
    } catch {
      return [];
    }
    return entry.people.value;
  }

  async function add(input: { field: string; anchor: CommentAnchor | null; quote: string | null; body: string; mentionIds: string[] }): Promise<string> {
    const created = await post<{ id: string }>('/comments', { document, ...input });
    await entry.load();
    return created.id;
  }

  async function reply(threadId: string, body: string, mentionIds: string[]): Promise<void> {
    await post('/comments', { document, parentId: threadId, body, mentionIds });
    await entry.load();
  }

  async function edit(id: string, body: string, mentionIds: string[]): Promise<void> {
    await patch(`/comments/${id}`, { body, mentionIds });
    await entry.load();
  }

  async function remove(id: string): Promise<void> {
    await del(`/comments/${id}`);
    await entry.load();
  }

  async function resolve(id: string, resolved: boolean): Promise<void> {
    await post(`/comments/${id}/resolve`, { resolved });
    await entry.load();
  }

  return { threads: entry.threads, loaded: entry.loaded, people: entry.people, loadPeople, add, reply, edit, remove, resolve };
}
