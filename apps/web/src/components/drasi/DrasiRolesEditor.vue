<template>
  <!--
    Αρχηγείο (section «arxigeio») ή υπηρεσίες (section «ypiresies»), με «ίδια
    όπως την προηγούμενη». Κοινό για το wizard και τις ρυθμίσεις της δράσης.
  -->
  <div>
    <div class="row items-center q-mb-sm">
      <div class="text-caption text-grey-7 col">
        <template v-if="section === 'arxigeio'">Περισσότερα από ένα άτομα ανά ευθύνη επιτρέπονται.</template>
        <template v-else>Διάλεξε μόνο όσες ισχύουν σε αυτή τη δράση — και ποιο στέλεχος την έχει.</template>
        <span v-if="templateSource"> Από «{{ templateSource.title }}».</span>
      </div>
      <q-btn flat dense color="klados" icon="history" label="Ίδια όπως την προηγούμενη" :loading="templating" @click="applyTemplate" />
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
import { ref } from 'vue';
import { useQuasar } from 'quasar';
import {
  DRASI_ARXIGEIO_KINDS,
  DRASI_ROLE_LABEL,
  DRASI_YPIRESIA_KINDS,
  type DrasiRoleKind,
  type DrasiRolesTemplate,
  type KladosType,
} from '@trifylli/shared';
import StelexosPicker, { type StelexosOption } from '../StelexosPicker.vue';
import { ApiError, get } from '../../lib/api';
import type { RolesMap } from './types';

const props = defineProps<{
  section: 'arxigeio' | 'ypiresies';
  modelValue: RolesMap;
  /** Ποιες υπηρεσίες ισχύουν (μόνο για section «ypiresies»). */
  enabled: DrasiRoleKind[];
  stelexiOptions: StelexosOption[];
  organiser: KladosType | null;
  /** Η δράση που στήνεται — εξαιρείται από το «ίδια όπως την προηγούμενη». */
  excludeDrasiId?: string | undefined;
}>();
const emit = defineEmits<{ 'update:modelValue': [RolesMap]; 'update:enabled': [DrasiRoleKind[]] }>();

const $q = useQuasar();
const templating = ref(false);
const templateSource = ref<DrasiRolesTemplate['source']>(null);

function set(kind: DrasiRoleKind, ids: string[]): void {
  emit('update:modelValue', { ...props.modelValue, [kind]: ids });
}
function toggle(kind: DrasiRoleKind, on: boolean): void {
  emit('update:enabled', on ? [...props.enabled, kind] : props.enabled.filter((k) => k !== kind));
}

async function applyTemplate(): Promise<void> {
  templating.value = true;
  try {
    const template = await get<DrasiRolesTemplate>('/draseis/roles-template', {
      params: { ...(props.organiser ? { klados: props.organiser } : {}), ...(props.excludeDrasiId ? { exclude: props.excludeDrasiId } : {}) },
    });
    if (!template.source) {
      $q.notify({ type: 'info', message: 'Δεν υπάρχει προηγούμενη δράση με αρχηγείο για αυτόν τον φορέα.' });
      return;
    }
    const kinds = props.section === 'arxigeio' ? DRASI_ARXIGEIO_KINDS : DRASI_YPIRESIA_KINDS;
    const next: RolesMap = { ...props.modelValue };
    for (const kind of kinds) next[kind] = template.roles.filter((r) => r.kind === kind).map((r) => r.userId);
    emit('update:modelValue', next);
    if (props.section === 'ypiresies') emit('update:enabled', DRASI_YPIRESIA_KINDS.filter((kind) => next[kind].length > 0));
    templateSource.value = template.source;
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία ανάκτησης προηγούμενης δράσης.' });
  } finally {
    templating.value = false;
  }
}
</script>
