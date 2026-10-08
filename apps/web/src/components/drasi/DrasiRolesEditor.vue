<template>
  <!--
    Αρχηγείο (section «arxigeio») ή υπηρεσίες (section «ypiresies»). Κοινό για
    το wizard και την ενότητα «Αρχηγείο» της δράσης.
  -->
  <div>
    <div class="text-caption text-grey-7 q-mb-sm">
      <template v-if="section === 'arxigeio'">Περισσότερα από ένα άτομα ανά ευθύνη επιτρέπονται.</template>
      <template v-else>Διάλεξε μόνο όσες ισχύουν σε αυτή τη δράση — και ποιο στέλεχος την έχει.</template>
    </div>

    <div v-if="section === 'arxigeio'" class="row q-col-gutter-md">
      <div v-for="kind in DRASI_ARXIGEIO_KINDS" :key="kind" class="col-12 col-md-6">
        <StelexosPicker :model-value="modelValue[kind]" :label="DRASI_ROLE_LABEL[kind]" :options="stelexiOptions" @update:model-value="(v: string[]) => set(kind, v)" />
      </div>
    </div>

    <q-list v-else bordered separator class="rounded-borders">
      <q-item v-for="kind in DRASI_YPIRESIA_KINDS" :key="kind" class="q-py-sm">
        <q-item-section side top>
          <q-toggle :model-value="enabled.includes(kind)" color="klados" @update:model-value="(v: boolean) => toggle(kind, v)" />
        </q-item-section>
        <q-item-section>
          <q-item-label :class="enabled.includes(kind) ? '' : 'text-grey-6'">{{ DRASI_ROLE_LABEL[kind] }}</q-item-label>
          <StelexosPicker
            v-if="enabled.includes(kind)"
            :model-value="modelValue[kind]"
            label="Υπεύθυνο στέλεχος"
            :options="stelexiOptions"
            class="q-mt-xs"
            @update:model-value="(v: string[]) => set(kind, v)"
          />
        </q-item-section>
      </q-item>
    </q-list>
  </div>
</template>

<script setup lang="ts">
import {
  DRASI_ARXIGEIO_KINDS,
  DRASI_ROLE_LABEL,
  DRASI_YPIRESIA_KINDS,
  type DrasiRoleKind,
  type KladosType,
} from '@trifylli/shared';
import StelexosPicker, { type StelexosOption } from '../StelexosPicker.vue';
import type { RolesMap } from './types';

const props = defineProps<{
  section: 'arxigeio' | 'ypiresies';
  modelValue: RolesMap;
  /** Ποιες υπηρεσίες ισχύουν (μόνο για section «ypiresies»). */
  enabled: DrasiRoleKind[];
  stelexiOptions: StelexosOption[];
  organiser: KladosType | null;
}>();
const emit = defineEmits<{ 'update:modelValue': [RolesMap]; 'update:enabled': [DrasiRoleKind[]] }>();

function set(kind: DrasiRoleKind, ids: string[]): void {
  emit('update:modelValue', { ...props.modelValue, [kind]: ids });
}
function toggle(kind: DrasiRoleKind, on: boolean): void {
  emit('update:enabled', on ? [...props.enabled, kind] : props.enabled.filter((k) => k !== kind));
}
</script>
