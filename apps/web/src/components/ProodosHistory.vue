<template>
  <div>
    <div class="section-title q-mb-xs">Προηγούμενοι κλάδοι</div>
    <q-list dense>
      <q-expansion-item
        v-for="group in history"
        :key="group.klados ?? '—'"
        dense
        expand-separator
        icon="history"
        :label="group.klados ? KLADOS_LABEL[group.klados] : 'Προηγούμενος κλάδος'"
        :caption="caption(group)"
      >
        <q-list dense class="q-pl-md">
          <q-item v-for="e in group.entries" :key="e.id" class="q-px-none">
            <q-item-section>
              <q-item-label>{{ kindLabel(group.klados, e.kind) }}<span v-if="e.title !== 'Υπόσχεση'">: {{ e.title }}</span></q-item-label>
              <q-item-label caption>
                <span v-if="e.category">{{ e.category }} · </span>{{ e.passedAt ? formatDate(e.passedAt) : '—' }}
              </q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-expansion-item>
    </q-list>
    <div class="text-caption text-grey-6 q-mt-xs">Μόνο για ανάγνωση — σε κάθε κλάδο η πρόοδος ξεκινά από την αρχή.</div>
  </div>
</template>

<script setup lang="ts">
import {
  ASTERI_ENTRY_KIND_LABEL,
  KLADOS_LABEL,
  MO_ENTRY_KIND_LABEL,
  POULIA_ENTRY_KIND_LABEL,
  PROODOS_ENTRY_KIND_LABEL,
  type KladosType,
} from '@trifylli/shared';
import { formatDate } from '../lib/format';

/** Οι εγγραφές ενός προηγούμενου κλάδου, όπως τις επιστρέφει το `/proodos/card/:klados/member/:id`. */
export interface ProodosHistoryGroup {
  klados: KladosType | null;
  leftAt: string | null;
  entries: { id: string; kind: string; category: string | null; title: string; passedAt: string | null }[];
}

defineProps<{ history: ProodosHistoryGroup[] }>();

const LABELS: Record<KladosType, Record<string, string>> = {
  ASTERIA: ASTERI_ENTRY_KIND_LABEL,
  POULIA: POULIA_ENTRY_KIND_LABEL,
  ODIGOI: PROODOS_ENTRY_KIND_LABEL,
  MEGALOI_ODIGOI: MO_ENTRY_KIND_LABEL,
};

function kindLabel(klados: KladosType | null, kind: string): string {
  return (klados && LABELS[klados][kind]) || kind;
}

function caption(group: ProodosHistoryGroup): string {
  const count = `${group.entries.length} ${group.entries.length === 1 ? 'εγγραφή' : 'εγγραφές'}`;
  return group.leftAt ? `${count} · έως ${formatDate(group.leftAt)}` : count;
}
</script>
