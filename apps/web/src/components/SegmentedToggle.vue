<template>
  <!--
    Segmented control πάνω στο q-btn-toggle της Quasar.

    Δύο πράγματα που το σκέτο q-btn-toggle δεν δίνει: ένα πλαίσιο, ώστε οι
    επιλογές να διαβάζονται ως ΕΝΑ στοιχείο και όχι ως σκόρπια κουμπιά, και ένα
    «χάπι» που γλιστρά από την παλιά επιλογή στη νέα αντί να αλλάζει απότομα.

    Όλα τα props/events περνούν αυτούσια στο q-btn-toggle (`v-model`, `options`,
    `dense`, `spread`…), οπότε στα call sites αλλάζει μόνο το όνομα του tag.
    Το χάπι μετριέται από το κουμπί με `aria-pressed="true"` — αυτό που η Quasar
    σημαδεύει ως ενεργό — άρα δεν χρειάζεται να ξέρουμε την τιμή.
  -->
  <!-- Το root δεν έχει δικό του padding/περίγραμμα: σε σειρές `q-col-gutter-*`
       η Quasar βάζει το κενό ως padding στα παιδιά, και θα το χάναμε. Το πλαίσιο
       ζει στο εσωτερικό `__frame`. -->
  <div
    class="tf-seg"
    :class="{ 'tf-seg--ready': ready, 'tf-seg--flat': isFlat, 'tf-seg--spread': isSpread }"
  >
    <div ref="root" class="tf-seg__frame">
      <span class="tf-seg__thumb" :style="thumbStyle" aria-hidden="true" />
      <q-btn-toggle
        v-bind="$attrs"
        :model-value="modelValue"
        :options="options"
        no-caps
        @update:model-value="(value: unknown) => emit('update:modelValue', value)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useAttrs } from 'vue';
import type { QBtnToggleProps } from 'quasar';

defineOptions({ inheritAttrs: false });

// Τα δύο υποχρεωτικά props του q-btn-toggle δηλώνονται ρητά — τα υπόλοιπα περνούν από τα attrs.
defineProps<{ modelValue: unknown; options: QBtnToggleProps['options'] }>();
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>();

const attrs = useAttrs();
const root = ref<HTMLElement | null>(null);
const ready = ref(false);
const thumb = ref<{ x: number; y: number; w: number; h: number } | null>(null);

const isFlat = computed(() => 'flat' in attrs && attrs.flat !== false);
const isSpread = computed(() => 'spread' in attrs && attrs.spread !== false);

const thumbStyle = computed(() =>
  thumb.value
    ? { transform: `translate(${thumb.value.x}px, ${thumb.value.y}px)`, width: `${thumb.value.w}px`, height: `${thumb.value.h}px`, opacity: 1 }
    : { opacity: 0 },
);

let frame = 0;
function measure(): void {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const host = root.value;
    const active = host?.querySelector<HTMLElement>('.q-btn[aria-pressed="true"]');
    if (!host || !active) {
      thumb.value = null;
      return;
    }
    const a = active.getBoundingClientRect();
    const r = host.getBoundingClientRect();
    thumb.value = { x: a.left - r.left, y: a.top - r.top, w: a.width, h: a.height };
    // Η πρώτη τοποθέτηση γίνεται χωρίς κίνηση· από εκεί και πέρα γλιστρά.
    if (!ready.value) requestAnimationFrame(() => (ready.value = true));
  });
}

let mutations: MutationObserver | null = null;
let resizes: ResizeObserver | null = null;

onMounted(() => {
  measure();
  // `aria-pressed` αλλάζει όταν αλλάζει η επιλογή — από κλικ ή από τον κώδικα.
  mutations = new MutationObserver(measure);
  if (root.value) mutations.observe(root.value, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'], childList: true });
  // Αλλαγή πλάτους (γραμματοσειρά που φόρτωσε, παράθυρο, `spread`): ξαναμέτρημα.
  resizes = new ResizeObserver(measure);
  if (root.value) resizes.observe(root.value);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  mutations?.disconnect();
  resizes?.disconnect();
});
</script>
