import { nextTick } from 'vue';

/** Η θέση ενός στοιχείου στην οθόνη — όσο χρειάζεται το FLIP. */
export interface FlipRect {
  left: number;
  top: number;
}

/**
 * Πόσο μετακινήθηκε κάθε στοιχείο που υπήρχε και πριν και μετά: από τη νέα του
 * θέση πρέπει να «ξεκινήσει» τόσο πίσω, για να φανεί ότι γλιστρά εκεί. Όσα δεν
 * κουνήθηκαν (ή μόλις εμφανίστηκαν) δεν κινούνται.
 */
export function flipOffsets(before: ReadonlyMap<string, FlipRect>, after: ReadonlyMap<string, FlipRect>): Map<string, { dx: number; dy: number }> {
  const offsets = new Map<string, { dx: number; dy: number }>();
  for (const [key, to] of after) {
    const from = before.get(key);
    if (!from) continue;
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) offsets.set(key, { dx, dy });
  }
  return offsets;
}

function positions(root: HTMLElement): Map<string, { el: HTMLElement; rect: FlipRect; seen: boolean }> {
  const out = new Map<string, { el: HTMLElement; rect: FlipRect; seen: boolean }>();
  for (const el of root.querySelectorAll<HTMLElement>('[data-flip]')) {
    const rect = el.getBoundingClientRect();
    out.set(el.dataset.flip!, { el, rect: { left: rect.left, top: rect.top }, seen: rect.bottom > 0 && rect.top < window.innerHeight });
  }
  return out;
}

/**
 * Αλλαγή με κίνηση (FLIP): μετρά πού είναι τα `[data-flip]` του `root`, κάνει
 * την αλλαγή, και όσα άλλαξαν θέση — και από στήλη σε στήλη, όπου το Vue φτιάχνει
 * νέο στοιχείο — γλιστρούν από την παλιά στη νέα. Σύντομα και χωρίς αναπήδηση·
 * καθόλου κίνηση όταν η συσκευή ζητά λιγότερη.
 */
export async function flip(root: HTMLElement | null, change: () => unknown, duration = 260): Promise<void> {
  const still = !root || typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (still) {
    await change();
    return;
  }
  const before = positions(root);
  await change();
  await nextTick();
  const after = positions(root);
  const offsets = flipOffsets(
    new Map([...before].map(([key, value]) => [key, value.rect])),
    new Map([...after].map(([key, value]) => [key, value.rect])),
  );
  for (const [key, { dx, dy }] of offsets) {
    // Μόνο όσα φαίνονται (πριν ή μετά): μια μακριά στήλη δεν κινεί δεκάδες κάρτες εκτός οθόνης.
    const now = after.get(key)!;
    if (!now.seen && !before.get(key)?.seen) continue;
    now.el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
      duration,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
    });
  }
}
