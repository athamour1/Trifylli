<template>
  <!--
    Φιλοξενούμενα Τοπικά: μόνο όνομα, με το χέρι — για άλλα Τοπικά το e-SEO δεν
    δίνει τίποτα παραπάνω. Ίδιο όνομα ξανά ⇒ αντικαθιστά το προηγούμενο.
    Κοινό για το wizard και τις ρυθμίσεις της δράσης.
  -->
  <div>
    <q-list v-if="modelValue.length" bordered separator class="rounded-borders q-mb-md">
      <q-item v-for="g in modelValue" :key="guestTopikoKey(g.topikoName)">
        <q-item-section>
          <q-item-label>{{ g.topikoName }}</q-item-label>
          <q-item-label caption>
            <span v-if="g.kladoi.length">{{ g.kladoi.map((k) => KLADOS_LABEL[k]).join(', ') }}</span>
            <span v-else>χωρίς δήλωση κλάδων</span>
            <span v-if="g.contactName"> · {{ g.contactName }}</span>
            <span v-if="g.contactPhone"> · {{ g.contactPhone }}</span>
          </q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-btn flat dense round icon="close" @click="remove(g.topikoName)"><q-tooltip>Αφαίρεση</q-tooltip></q-btn>
        </q-item-section>
      </q-item>
    </q-list>

    <q-card flat bordered class="q-pa-md">
      <div class="row q-col-gutter-sm items-start">
        <div class="col-12 col-sm-6">
          <q-input v-model="draft.name" label="Όνομα Τοπικού" outlined dense maxlength="120" />
        </div>
        <div class="col-6 col-sm-3"><q-input v-model="draft.contactName" label="Επαφή" outlined dense maxlength="120" /></div>
        <div class="col-6 col-sm-3"><q-input v-model="draft.contactPhone" label="Τηλέφωνο" outlined dense maxlength="40" /></div>
        <div class="col-12">
          <div class="text-caption text-grey-7">Ποιοι κλάδοι τους έρχονται</div>
          <q-option-group v-model="draft.kladoi" type="checkbox" color="klados" inline :options="kladosOptions" />
        </div>
        <div class="col-12">
          <q-btn outline color="klados" icon="add" label="Προσθήκη Τοπικού" :disable="!draft.name.trim()" @click="add" />
        </div>
      </div>
    </q-card>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { guestTopikoKey, KLADOI_IN_ORDER, KLADOS_LABEL, type KladosType } from '@trifylli/shared';
import type { GuestTopikoForm } from './types';

const props = defineProps<{ modelValue: GuestTopikoForm[] }>();
const emit = defineEmits<{ 'update:modelValue': [GuestTopikoForm[]] }>();

const kladosOptions = KLADOI_IN_ORDER.map((k) => ({ label: KLADOS_LABEL[k], value: k }));
const draft = reactive({ name: '', kladoi: [] as KladosType[], contactName: '', contactPhone: '' });

function add(): void {
  const name = draft.name.trim();
  const key = guestTopikoKey(name);
  const entry: GuestTopikoForm = { topikoName: name, kladoi: [...draft.kladoi], contactName: draft.contactName.trim(), contactPhone: draft.contactPhone.trim() };
  emit('update:modelValue', [...props.modelValue.filter((g) => guestTopikoKey(g.topikoName) !== key), entry]);
  Object.assign(draft, { name: '', kladoi: [], contactName: '', contactPhone: '' });
}

function remove(name: string): void {
  const key = guestTopikoKey(name);
  emit('update:modelValue', props.modelValue.filter((g) => guestTopikoKey(g.topikoName) !== key));
}
</script>
