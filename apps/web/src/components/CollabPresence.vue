<template>
  <div v-if="peers.length" class="row items-center no-wrap collab-presence" :aria-label="summary">
    <div class="row no-wrap collab-presence__faces">
      <q-avatar
        v-for="peer in shown"
        :key="peer.id"
        size="26px"
        class="collab-presence__face"
        :style="{ background: peer.color }"
        text-color="white"
      >
        {{ initials(peer.fullName || peer.name) }}
        <q-tooltip>{{ peer.fullName || peer.name }}</q-tooltip>
      </q-avatar>
      <q-avatar v-if="hidden" size="26px" class="collab-presence__face collab-presence__more">+{{ hidden }}</q-avatar>
    </div>
    <span class="text-caption text-grey-7 q-ml-sm gt-xs">{{ summary }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { CollabPresenceUser } from '@trifylli/shared';

/**
 * Ποιοι άλλοι είναι τώρα στο ίδιο έγγραφο — avatars στο χρώμα του κέρσορά τους.
 * Μόνο ονόματα στελεχών (τα δίνει ο server από τον λογαριασμό).
 */
const props = defineProps<{ peers: CollabPresenceUser[] }>();

const MAX_FACES = 4;
const shown = computed(() => props.peers.slice(0, MAX_FACES));
const hidden = computed(() => Math.max(0, props.peers.length - MAX_FACES));

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
.collab-presence__face {
  font-size: 11px;
  font-weight: 700;
  border: 2px solid var(--surface);
  margin-left: -6px;

  &:first-child {
    margin-left: 0;
  }
}
.collab-presence__more {
  background: var(--tint);
  color: var(--ink);
}
</style>
