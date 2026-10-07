<template>
  <!--
    Φιλοξενούμενα Τοπικά: με τον κωδικό e-SEO παίρνουμε το επίσημο όνομα (το
    token μας βλέπει μονάδες μόνο με κωδικό, όχι λίστα)· αλλιώς όνομα με το χέρι.
    Κοινό για το wizard και τις ρυθμίσεις της δράσης.
  -->
  <div>
    <div class="text-caption text-grey-7 q-mb-sm">
      Με τον κωδικό του Τοπικού στο e-SEO παίρνουμε το επίσημο όνομα. Αν το e-SEO δεν απαντά, γράψε το όνομα με το χέρι.
    </div>

    <q-list v-if="modelValue.length" bordered separator class="rounded-borders q-mb-md">
      <q-item v-for="g in modelValue" :key="g.topikoCode">
        <q-item-section>
          <q-item-label>{{ g.topikoName }} <span class="text-grey-6 text-caption">· e-SEO {{ g.topikoCode }}</span></q-item-label>
          <q-item-label caption>
            <span v-if="g.kladoi.length">{{ g.kladoi.map((k) => KLADOS_LABEL[k]).join(', ') }}</span>
            <span v-else>χωρίς δήλωση κλάδων</span>
            <span v-if="g.contactName"> · {{ g.contactName }}</span>
            <span v-if="g.contactPhone"> · {{ g.contactPhone }}</span>
          </q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-btn flat dense round icon="close" @click="remove(g.topikoCode)"><q-tooltip>Αφαίρεση</q-tooltip></q-btn>
        </q-item-section>
      </q-item>
    </q-list>

    <q-card flat bordered class="q-pa-md">
      <div class="row q-col-gutter-sm items-start">
        <div class="col-6 col-sm-3">
          <q-input v-model="draft.code" label="Κωδικός e-SEO" outlined dense inputmode="numeric" maxlength="10" :loading="lookingUp" @keyup.enter="lookup">
            <template #append>
              <q-btn flat dense round icon="search" :disable="!draft.code" @click="lookup"><q-tooltip>Αναζήτηση στο e-SEO</q-tooltip></q-btn>
            </template>
          </q-input>
        </div>
        <div class="col-12 col-sm-5">
          <q-input v-model="draft.name" label="Όνομα Τοπικού" outlined dense maxlength="120" :hint="draft.parentName ? `Τομέας: ${draft.parentName}` : hint" />
        </div>
        <div class="col-6 col-sm-2"><q-input v-model="draft.contactName" label="Επαφή" outlined dense maxlength="120" /></div>
        <div class="col-6 col-sm-2"><q-input v-model="draft.contactPhone" label="Τηλέφωνο" outlined dense maxlength="40" /></div>
        <div class="col-12">
          <div class="text-caption text-grey-7">Ποιοι κλάδοι τους έρχονται</div>
          <q-option-group v-model="draft.kladoi" type="checkbox" color="klados" inline :options="kladosOptions" />
        </div>
        <div class="col-12">
          <q-btn outline color="klados" icon="add" label="Προσθήκη Τοπικού" :disable="!draft.code.trim() || !draft.name.trim()" @click="add" />
        </div>
      </div>
    </q-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import { KLADOI_IN_ORDER, KLADOS_LABEL, type EseoUnitInfo, type KladosType } from '@trifylli/shared';
import { ApiError, get } from '../../lib/api';
import type { GuestTopikoForm } from './types';

const props = defineProps<{ modelValue: GuestTopikoForm[] }>();
const emit = defineEmits<{ 'update:modelValue': [GuestTopikoForm[]] }>();

const kladosOptions = KLADOI_IN_ORDER.map((k) => ({ label: KLADOS_LABEL[k], value: k }));
const draft = reactive({ code: '', name: '', parentName: '', kladoi: [] as KladosType[], contactName: '', contactPhone: '' });
const lookingUp = ref(false);
const hint = ref<string | undefined>(undefined);

async function lookup(): Promise<void> {
  const code = draft.code.trim();
  if (!/^\d{1,10}$/.test(code)) {
    hint.value = 'Ο κωδικός e-SEO είναι αριθμός.';
    return;
  }
  lookingUp.value = true;
  hint.value = undefined;
  draft.parentName = '';
  try {
    const unit = await get<EseoUnitInfo>(`/draseis/eseo-topiko/${code}`);
    draft.name = unit.name;
    draft.parentName = unit.parentName ?? '';
    if (unit.type && unit.type !== 'LOCAL') hint.value = 'Προσοχή: ο κωδικός δεν είναι Τοπικό Τμήμα.';
  } catch (err) {
    hint.value = err instanceof ApiError && err.status === 404 ? 'Δεν βρέθηκε στο e-SEO — γράψε το όνομα με το χέρι.' : 'Το e-SEO δεν απαντά — γράψε το όνομα με το χέρι.';
  } finally {
    lookingUp.value = false;
  }
}

function add(): void {
  const code = draft.code.trim();
  if (!/^\d{1,10}$/.test(code)) {
    hint.value = 'Ο κωδικός e-SEO είναι αριθμός.';
    return;
  }
  const entry: GuestTopikoForm = { topikoCode: code, topikoName: draft.name.trim(), kladoi: [...draft.kladoi], contactName: draft.contactName.trim(), contactPhone: draft.contactPhone.trim() };
  emit('update:modelValue', [...props.modelValue.filter((g) => g.topikoCode !== code), entry]);
  Object.assign(draft, { code: '', name: '', parentName: '', kladoi: [], contactName: '', contactPhone: '' });
  hint.value = undefined;
}

function remove(code: string): void {
  emit('update:modelValue', props.modelValue.filter((g) => g.topikoCode !== code));
}
</script>
