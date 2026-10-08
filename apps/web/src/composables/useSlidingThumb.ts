import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

/**
 * Ένα «χάπι» που γλιστρά στο ενεργό στοιχείο μιας λίστας/ομάδας, αντί το
 * highlight να εμφανίζεται απότομα στο νέο σημείο.
 *
 * Δεν ξέρει τίποτα για το τι είναι ενεργό: μετρά όποιο στοιχείο ταιριάζει στον
 * `activeSelector` μέσα στο `root` (π.χ. `.drasi-nav__active`, `[aria-pressed="true"]`),
 * και ξαναμετρά σε κάθε αλλαγή κλάσης/attribute, σε αλλαγή παιδιών και σε
 * αλλαγή μεγέθους. Η πρώτη τοποθέτηση γίνεται χωρίς κίνηση (`ready` = false).
 *
 * Το ίδιο το χάπι το ζωγραφίζει ο καλών (absolute μέσα στο root, με το
 * `thumbStyle`), ώστε κάθε χρήση να έχει τη δική της εμφάνιση.
 */
export function useSlidingThumb(root: Ref<HTMLElement | null>, activeSelector: string) {
  const ready = ref(false);
  const box = ref<{ x: number; y: number; w: number; h: number } | null>(null);

  const thumbStyle = computed(() =>
    box.value
      ? {
          transform: `translate(${box.value.x}px, ${box.value.y}px)`,
          width: `${box.value.w}px`,
          height: `${box.value.h}px`,
          opacity: 1,
        }
      : { opacity: 0 },
  );

  let frame = 0;
  function measure(): void {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const host = root.value;
      const active = host?.querySelector<HTMLElement>(activeSelector);
      if (!host || !active) {
        box.value = null;
        return;
      }
      const a = active.getBoundingClientRect();
      const r = host.getBoundingClientRect();
      // Το root μπορεί να κυλά: μετράμε σε σχέση με το περιεχόμενό του, όχι το viewport.
      box.value = { x: a.left - r.left + host.scrollLeft, y: a.top - r.top + host.scrollTop, w: a.width, h: a.height };
      if (!ready.value) requestAnimationFrame(() => (ready.value = true));
    });
  }

  let mutations: MutationObserver | null = null;
  let resizes: ResizeObserver | null = null;

  function detach(): void {
    mutations?.disconnect();
    resizes?.disconnect();
    mutations = null;
    resizes = null;
  }

  function attach(el: HTMLElement): void {
    detach();
    mutations = new MutationObserver(measure);
    resizes = new ResizeObserver(measure);
    mutations.observe(el, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-pressed', 'aria-current'], childList: true });
    resizes.observe(el);
    measure();
  }

  // Το root μπορεί να εμφανιστεί αργότερα (π.χ. μέσα σε `v-if` που περιμένει
  // δεδομένα) ή να αντικατασταθεί· ακολουθούμε το ref, όχι μόνο το mount.
  onMounted(() => {
    watch(
      root,
      (el) => {
        if (el) attach(el);
        else {
          detach();
          box.value = null;
          ready.value = false;
        }
      },
      { immediate: true },
    );
  });

  onBeforeUnmount(() => {
    cancelAnimationFrame(frame);
    detach();
  });

  return { thumbStyle, ready, measure };
}
