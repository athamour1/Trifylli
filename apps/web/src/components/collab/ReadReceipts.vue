<template>
  <q-btn v-if="view?.version" flat dense no-caps size="sm" icon="done_all" :label="`Το διάβασαν ${readCount}/${people.length}`">
    <q-menu anchor="bottom left" self="top left">
      <q-list dense style="min-width: 240px; max-height: 50vh" class="scroll">
        <q-item-label header class="q-pb-xs">
          {{ view.version.label ? `${view.version.label} · ` : '' }}{{ formatDateTime(view.version.createdAt) }}
        </q-item-label>
        <q-item v-for="person in people" :key="person.id">
          <q-item-section avatar class="read-receipts__mark">
            <q-icon :name="person.read ? 'check_circle' : 'radio_button_unchecked'" :color="person.read ? 'positive' : 'grey-5'" size="18px" />
          </q-item-section>
          <q-item-section>
            <q-item-label>{{ person.firstName }} {{ person.lastName }}</q-item-label>
            <q-item-label v-if="person.readAt" caption>{{ formatDateTime(person.readAt) }}</q-item-label>
            <q-item-label v-else-if="person.older" caption>διάβασε παλιότερη εκδοχή</q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </q-menu>
  </q-btn>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { DocReadersView } from '@trifylli/shared';
import { onDocumentChange } from '../../composables/useCollabDoc';
import { get, post } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

/**
 * «Το διάβασαν 5/8» για ένα κοινό έγγραφο που έχει κλειδώσει (πρακτικά μετά την
 * οριστικοποίηση, εγκεκριμένα προγραμματικά): όποιος το ανοίγει σημειώνεται ότι
 * το διάβασε, και η λίστα δείχνει ποια στελέχη δεν το έχουν ανοίξει ακόμα.
 */
const props = defineProps<{ document: string }>();

const view = ref<DocReadersView | null>(null);

/** Τα στελέχη του εγγράφου — και όποιος άλλος το άνοιξε (π.χ. ο διαχειριστής), για να μετρηθεί κι αυτός. */
const people = computed(() => {
  const reads = new Map((view.value?.readers ?? []).map((read) => [read.person.id, read]));
  const everyone = new Map((view.value?.audience ?? []).map((person) => [person.id, person]));
  for (const read of view.value?.readers ?? []) if (!everyone.has(read.person.id)) everyone.set(read.person.id, read.person);
  return [...everyone.values()]
    .map((person) => {
      const read = reads.get(person.id);
      return { ...person, read: !!read?.current, readAt: read?.current ? read.readAt : null, older: !!read && !read.current };
    })
    .sort((a, b) => Number(b.read) - Number(a.read) || a.firstName.localeCompare(b.firstName, 'el'));
});
const readCount = computed(() => people.value.filter((person) => person.read).length);

async function load(): Promise<void> {
  try {
    view.value = await get<DocReadersView>('/reads', { params: { document: props.document } });
  } catch {
    // Χωρίς δίκτυο: χωρίς τη μέτρηση — δεν είναι κρίσιμη.
  }
}

onMounted(async () => {
  try {
    await post('/reads', { document: props.document });
  } catch {
    // Θα μετρηθεί την επόμενη φορά που θα ανοίξει με δίκτυο.
  }
  await load();
});

const stop = onDocumentChange(props.document, (change) => {
  if (change.topic === 'reads' || change.topic === 'versions' || change.topic === '*') void load();
});
onBeforeUnmount(stop);
</script>

<style scoped lang="scss">
.read-receipts__mark {
  min-width: 30px;
}
</style>
