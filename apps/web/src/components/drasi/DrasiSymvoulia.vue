<template>
  <div>
    <div class="row items-center q-mb-md q-gutter-sm">
      <div class="text-caption text-grey-7 col">Συμβούλια προετοιμασίας — ατζέντα και πρακτικά όπως σε κάθε συμβούλιο.</div>
      <q-btn v-if="canWrite" color="klados" text-color="klados-on" unelevated icon="add" label="Νέο συμβούλιο" :loading="creating" @click="create" />
    </div>

    <q-inner-loading :showing="loading" />

    <div v-if="!loading && !rows.length" class="text-center text-grey-6 q-pa-lg">
      <q-icon name="forum" size="40px" class="block q-mx-auto q-mb-sm" />
      Κανένα συμβούλιο για αυτή τη δράση.
    </div>

    <q-list v-else bordered separator class="rounded-borders">
      <q-item v-for="s in rows" :key="s.id" clickable :to="{ name: 'symvoulio', params: { id: s.id } }">
        <q-item-section avatar>
          <q-icon :name="s.finalized ? 'lock' : 'edit_note'" :color="s.finalized ? 'positive' : 'grey-6'" />
        </q-item-section>
        <q-item-section>
          <q-item-label>{{ s.title ?? SYMVOULIO_TYPE_LABEL[s.type] }}</q-item-label>
          <q-item-label caption>{{ formatDate(s.date) }} · {{ SYMVOULIO_TYPE_LABEL[s.type] }} · {{ s.participants }} συμμετέχοντες</q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-badge :color="s.finalized ? 'positive' : 'grey-6'" :label="s.finalized ? 'Πρακτικά εγκεκριμένα' : 'Ανοιχτό'" />
        </q-item-section>
      </q-item>
    </q-list>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useRouter } from 'vue-router';
import { SYMVOULIO_TYPE_LABEL, type DrasiSymvoulioView } from '@trifylli/shared';
import { ApiError, get, post } from '../../lib/api';
import { formatDate } from '../../lib/format';

const props = defineProps<{ drasiId: string; canWrite: boolean }>();
const $q = useQuasar();
const router = useRouter();
const loading = ref(false);
const creating = ref(false);
const rows = ref<DrasiSymvoulioView[]>([]);

async function reload(): Promise<void> {
  loading.value = true;
  try {
    rows.value = await get<DrasiSymvoulioView[]>(`/draseis/${props.drasiId}/symvoulia`);
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία φόρτωσης.' });
  } finally {
    loading.value = false;
  }
}
onMounted(reload);

/** Γεννιέται και ανοίγει αμέσως — η ατζέντα γράφεται εκεί που γράφονται και τα πρακτικά. */
async function create(): Promise<void> {
  creating.value = true;
  try {
    const created = await post<{ id: string }>(`/draseis/${props.drasiId}/symvoulia`, {});
    await router.push({ name: 'symvoulio', params: { id: created.id } });
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία δημιουργίας.' });
  } finally {
    creating.value = false;
  }
}
</script>
