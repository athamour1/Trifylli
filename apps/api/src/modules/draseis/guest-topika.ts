import { guestTopikoKey } from '@trifylli/shared';

export interface GuestTopikaPlan<T> {
  create: T[];
  /** Όσα μένουν, με το id τους — έτσι το υλικό που φέρνουν δεν χάνει τον κάτοχό του. */
  update: { id: string; item: T }[];
  remove: string[];
  /** Ονόματα που δόθηκαν δύο φορές· τότε η λίστα απορρίπτεται ολόκληρη. */
  duplicates: string[];
}

/**
 * Πώς η νέα λίστα φιλοξενούμενων Τοπικών αντικαθιστά την αποθηκευμένη χωρίς να
 * αλλάξουν τα id όσων μένουν: πρώτα με το `id` της φόρμας (άρα και μετά από
 * μετονομασία), μετά με το όνομα (σβήστηκε και ξαναγράφτηκε)· ό,τι περισσεύει
 * είναι νέο. Ένα `id` που δεν είναι αυτής της δράσης δεν το εμπιστευόμαστε.
 */
export function planGuestTopika<T extends { id?: string; topikoName: string }>(
  stored: readonly { id: string; topikoName: string }[],
  items: readonly T[],
): GuestTopikaPlan<T> {
  const names = new Set<string>();
  const duplicates: string[] = [];
  for (const item of items) {
    const key = guestTopikoKey(item.topikoName);
    if (names.has(key)) duplicates.push(item.topikoName.trim());
    names.add(key);
  }
  if (duplicates.length) return { create: [], update: [], remove: [], duplicates };

  const free = new Map(stored.map((row) => [row.id, row]));
  const matched = new Map<T, string>();
  for (const item of items) {
    if (item.id && free.has(item.id)) {
      matched.set(item, item.id);
      free.delete(item.id);
    }
  }
  const byName = new Map([...free.values()].map((row) => [guestTopikoKey(row.topikoName), row.id]));
  for (const item of items) {
    if (matched.has(item)) continue;
    const id = byName.get(guestTopikoKey(item.topikoName));
    if (id && free.has(id)) {
      matched.set(item, id);
      free.delete(id);
    }
  }

  return {
    create: items.filter((item) => !matched.has(item)),
    update: items.flatMap((item) => {
      const id = matched.get(item);
      return id ? [{ id, item }] : [];
    }),
    remove: [...free.keys()],
    duplicates: [],
  };
}
