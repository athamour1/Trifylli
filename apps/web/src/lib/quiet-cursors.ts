import { ViewPlugin, type EditorView } from '@codemirror/view';
import type { Awareness } from 'y-protocols/awareness';

/** Από τόσους κέρσορες και πάνω τα ονόματα δεν χωρούν όλα μαζί πάνω από το κείμενο. */
export const CURSOR_CROWD = 4;
/** Πόσο μένει ορατό το όνομα μετά από κίνηση ή πληκτρολόγηση. */
export const CURSOR_RECENT_MS = 3000;

/**
 * Ποια ονόματα κρύβονται: με λίγους κέρσορες κανένα (φαίνονται πάντα)· με
 * πολλούς, όσων δεν κουνήθηκαν τα τελευταία δευτερόλεπτα — ο κέρσορας και η
 * κουκκίδα στο χρώμα τους μένουν, το όνομα ξαναβγαίνει στο hover.
 */
export function quietCursorNames(names: readonly string[], lastActive: ReadonlyMap<string, number>, now: number): Set<string> {
  const unique = new Set(names);
  if (unique.size < CURSOR_CROWD) return new Set();
  return new Set([...unique].filter((name) => now - (lastActive.get(name) ?? 0) > CURSOR_RECENT_MS));
}

/**
 * Οι κέρσορες των άλλων όταν είναι πολλοί: το όνομα φαίνεται μόνο σε όποιον
 * μόλις κουνήθηκε (`quietCursorNames`). Ακούει την awareness για το «ποιος
 * κουνήθηκε» και σημαδεύει τα στοιχεία του y-codemirror (`--quiet`).
 */
export function quietCursors(awareness: Awareness) {
  return ViewPlugin.fromClass(
    class {
      private readonly lastActive = new Map<string, number>();
      private timer: ReturnType<typeof setTimeout> | null = null;

      constructor(private readonly view: EditorView) {
        awareness.on('change', this.onChange);
        this.schedule(0);
      }

      private readonly onChange = ({ added, updated }: { added: number[]; updated: number[] }): void => {
        const now = Date.now();
        for (const id of [...added, ...updated]) {
          if (id === awareness.clientID) continue;
          const name = (awareness.getStates().get(id) as { user?: { name?: string } } | undefined)?.user?.name;
          if (name) this.lastActive.set(name, now);
        }
        this.schedule(0);
      };

      // Οι κέρσορες ξαναζωγραφίζονται με κάθε αλλαγή: ξανασημαδεύονται.
      update(): void {
        this.schedule(0);
      }

      private schedule(ms: number): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.apply(), ms);
      }

      private apply(): void {
        this.timer = null;
        const now = Date.now();
        const carets = [...this.view.dom.querySelectorAll<HTMLElement>('.cm-ySelectionCaret')];
        // Το y-codemirror τυλίγει το όνομα σε αόρατους «word joiners» (U+2060).
        const nameOf = (el: HTMLElement): string => (el.querySelector('.cm-ySelectionInfo')?.textContent ?? '').replace(/⁠/g, '').trim();
        const quiet = quietCursorNames(carets.map(nameOf), this.lastActive, now);
        for (const el of carets) el.classList.toggle('cm-ySelectionCaret--quiet', quiet.has(nameOf(el)));
        // Ξανακοιτάζει όταν σβήνει το επόμενο «μόλις κουνήθηκε».
        const due = [...this.lastActive.values()].map((at) => at + CURSOR_RECENT_MS - now).filter((ms) => ms > 0);
        if (due.length) this.schedule(Math.min(...due) + 50);
      }

      destroy(): void {
        awareness.off('change', this.onChange);
        if (this.timer) clearTimeout(this.timer);
      }
    },
  );
}
