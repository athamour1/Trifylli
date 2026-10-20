<template>
  <div v-if="peers.length" class="row items-center no-wrap collab-presence" :aria-label="summary">
    <div class="row no-wrap collab-presence__faces">
      <q-avatar
        v-for="peer in shown"
        :key="peer.id"
        :size="compact ? '20px' : '26px'"
        class="collab-presence__face"
        :style="{ background: peer.color }"
        text-color="white"
      >
        {{ initials(peer.fullName || peer.name) }}
        <q-tooltip>{{ peer.fullName || peer.name }}</q-tooltip>
      </q-avatar>
      <q-avatar v-if="hidden" :size="compact ? '20px' : '26px'" class="collab-presence__face collab-presence__more">
        +{{ hidden }}
        <q-tooltip>{{ rest }}</q-tooltip>
      </q-avatar>
    </div>
    <!-- Στενό σημείο (κεφαλίδα, κινητό): το κείμενο κόβεται με «…», τα πρόσωπα μένουν. -->
    <span v-if="!compact" class="text-caption text-grey-7 q-ml-sm gt-xs ellipsis collab-presence__summary">
      {{ summary }}
      <q-tooltip>{{ summary }}</q-tooltip>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CollabPresenceUser } from '@trifylli/shared';

/**
 * Ποιοι άλλοι είναι τώρα στο ίδιο έγγραφο — avatars στο χρώμα του κέρσορά τους.
 * Μόνο ονόματα στελεχών (τα δίνει ο server από τον λογαριασμό).
 */
const props = withDefaults(
  defineProps<{
    peers: CollabPresenceUser[];
    /** Μικρά πρόσωπα χωρίς κείμενο — π.χ. δίπλα σε μια γραμμή που επεξεργάζεται κάποιος. */
    compact?: boolean;
  }>(),
  { compact: false },
);

const MAX_FACES = 4;
const shown = computed(() => props.peers.slice(0, MAX_FACES));
const hidden = computed(() => Math.max(0, props.peers.length - MAX_FACES));
/** Όσοι δεν χωρούν στα πρόσωπα — στο «+N». */
const rest = computed(() => props.peers.slice(MAX_FACES).map((p) => p.fullName || p.name).join(', '));

const summary = computed(() => {
  const names = props.peers.map((p) => p.name.split(' ')[0]);
  if (names.length === 1) return `Εδώ και ${names[0]}`;
  if (names.length <= 3) return `Εδώ και ${names.slice(0, -1).join(', ')} και ${names.at(-1)}`;
  return `Εδώ και ${names.slice(0, 2).join(', ')} και ${names.length - 2} ακόμη`;
});

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('el'))
    .join('');
}
</script>

<style scoped lang="scss">
.collab-presence {
  min-width: 0;
  max-width: 100%;
}
.collab-presence__faces {
  flex: none;
}
.collab-presence__summary {
  min-width: 0;
}
.collab-presence__face {
  font-weight: 700;
  // Δαχτυλίδι και όχι περίγραμμα: το περίγραμμα έτρωγε χώρο μέσα στον κύκλο και
  // τα αρχικά έφευγαν ~1.5px δεξιά-κάτω από το κέντρο.
  box-shadow: 0 0 0 2px var(--surface);
  margin-left: -4px;

  // Το Quasar δίνει στο περιεχόμενο το μισό του μεγέθους: δύο έντονα κεφαλαία
  // («ΜΠ») ξεχείλιζαν από τον κύκλο. Σχετικό μέγεθος — χωρά και στα μικρά πρόσωπα.
  :deep(.q-avatar__content) {
    font-size: 0.4em;
    letter-spacing: -0.02em;
  }

  &:first-child {
    margin-left: 0;
  }
}
.collab-presence__more {
  background: var(--tint);
  color: var(--ink);
}
</style>
