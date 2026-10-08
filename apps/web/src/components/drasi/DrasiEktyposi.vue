<template>
  <div>
    <div class="text-caption text-grey-7 q-mb-md">
      Εκτυπώσεις χωριστές, γιατί δεν πάνε στα ίδια χέρια. Ανοίγει ο διάλογος εκτύπωσης — «Αποθήκευση ως PDF» για αρχείο.
    </div>
    <div class="row q-col-gutter-md">
      <div class="col-12 col-md-4">
        <q-card flat bordered class="full-height column">
          <q-card-section class="col">
            <div class="text-subtitle1 text-weight-medium"><q-icon name="folder" color="klados" class="q-mr-xs" />Ντοσιέ στελεχών</div>
            <div class="text-caption text-grey-7 q-mt-xs">
              Αρχηγείο, μύθος και ρόλοι, πρόγραμμα ανά ημέρα με υπευθύνους, συμμετέχοντες, ομάδες και σκηνές, υλικό, ταμείο, πρακτικά, αξιολόγηση.
            </div>
            <q-toggle v-if="canHealth" v-model="withHealth" dense color="klados" label="Μαζί με τη σύνοψη υγείας (εμπιστευτικό)" class="q-mt-sm" />
          </q-card-section>
          <q-card-actions align="right">
            <q-btn color="klados" text-color="klados-on" unelevated icon="print" label="Εκτύπωση" :loading="busy === 'full'" @click="print('full')" />
          </q-card-actions>
        </q-card>
      </div>
      <div class="col-12 col-md-4">
        <q-card flat bordered class="full-height column">
          <q-card-section class="col">
            <div class="text-subtitle1 text-weight-medium"><q-icon name="list_alt" color="klados" class="q-mr-xs" />Λίστα συμμετεχόντων</div>
            <div class="text-caption text-grey-7 q-mt-xs">Ονόματα, κλάδος, ομάδα, σκηνή, τηλέφωνο. <b>Χωρίς ιατρικά.</b> Για όποιον τη χρειαστεί.</div>
          </q-card-section>
          <q-card-actions align="right">
            <q-btn color="klados" text-color="klados-on" unelevated icon="print" label="Εκτύπωση" :loading="busy === 'participants'" @click="print('participants')" />
          </q-card-actions>
        </q-card>
      </div>
      <div v-if="hasSkines" class="col-12 col-md-4">
        <q-card flat bordered class="full-height column">
          <q-card-section class="col">
            <div class="text-subtitle1 text-weight-medium"><q-icon name="night_shelter" color="klados" class="q-mr-xs" />Σκηνές</div>
            <div class="text-caption text-grey-7 q-mt-xs">Ποιος κοιμάται πού — μία σελίδα, αυτό ζητιέται στις 11 το βράδυ.</div>
          </q-card-section>
          <q-card-actions align="right">
            <q-btn color="klados" text-color="klados-on" unelevated icon="print" label="Εκτύπωση" :loading="busy === 'skines'" @click="print('skines')" />
          </q-card-actions>
        </q-card>
      </div>
    </div>

    <!-- Το φύλλο ζει κρυφό στη σελίδα· κλωνοποιείται στο iframe εκτύπωσης. -->
    <div v-if="dossier" class="dossier-host" aria-hidden="true">
      <DrasiPrint :dossier="dossier" :mode="mode" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { useQuasar } from 'quasar';
import type { DrasiDossier } from '@trifylli/shared';
import DrasiPrint, { type DossierMode } from './DrasiPrint.vue';
import { ApiError, get } from '../../lib/api';
import { printElement } from '../../lib/print';

const props = defineProps<{ drasiId: string; title: string; hasSkines: boolean; /** Βλέπει υγεία (φαρμακείο/αρχηγός/διαχείριση). */ canHealth: boolean }>();
const $q = useQuasar();
const busy = ref<DossierMode | null>(null);
const withHealth = ref(false);
const dossier = ref<DrasiDossier | null>(null);
const mode = ref<DossierMode>('full');

async function print(which: DossierMode): Promise<void> {
  busy.value = which;
  try {
    mode.value = which;
    dossier.value = await get<DrasiDossier>(`/draseis/${props.drasiId}/dossier`, {
      params: { health: which === 'full' && withHealth.value ? '1' : '0', treasury: which === 'full' ? '1' : '0' },
    });
    await nextTick();
    const sheet = document.querySelector<HTMLElement>('.dossier-host .print-sheet');
    if (!sheet) throw new Error('Το φύλλο δεν ετοιμάστηκε.');
    const suffix = which === 'full' ? 'Ντοσιέ' : which === 'participants' ? 'Συμμετέχοντες' : 'Σκηνές';
    await printElement(sheet, `${props.title} — ${suffix}`);
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία εκτύπωσης.' });
  } finally {
    busy.value = null;
  }
}

defineExpose({ print });
</script>

<style scoped>
.dossier-host {
  position: absolute;
  left: -10000px;
  top: 0;
  width: 800px;
}
</style>
