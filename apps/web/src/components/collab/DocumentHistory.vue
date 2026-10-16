<template>
  <q-btn
    flat
    dense
    no-caps
    :round="compact"
    size="sm"
    icon="history"
    :label="compact ? undefined : 'Ιστορικό'"
    aria-label="Ιστορικό"
    @mousedown.prevent
    @click="openDialog"
  >
    <q-tooltip v-if="compact">Ιστορικό εκδόσεων</q-tooltip>
  </q-btn>

  <q-dialog v-model="open" :maximized="$q.screen.lt.sm" transition-show="fade" transition-hide="fade">
    <q-card class="history-card column no-wrap">
      <q-card-section class="row items-center no-wrap q-py-sm">
        <q-btn v-if="$q.screen.lt.sm && selected" flat round dense icon="arrow_back" aria-label="Πίσω στις εκδόσεις" @click="selected = null" />
        <div class="text-subtitle1 col q-ml-xs">Ιστορικό</div>
        <q-btn v-close-popup flat round dense icon="close" aria-label="Κλείσιμο" />
      </q-card-section>
      <q-separator />

      <div class="col row no-wrap history-body">
        <!-- Οι εκδόσεις -->
        <div v-show="!$q.screen.lt.sm || !selected" class="history-list" :class="{ 'history-list--full': $q.screen.lt.sm }">
          <div v-if="loading" class="q-pa-md text-center"><q-spinner size="24px" /></div>
          <div v-else-if="!versions.length" class="q-pa-md text-caption text-grey-7">
            Δεν υπάρχουν ακόμα εκδόσεις — κρατιούνται μόνες τους όσο γράφετε.
          </div>
          <q-list v-else>
            <q-item
              v-for="(version, index) in versions"
              :key="version.id"
              clickable
              :active="selected?.id === version.id"
              active-class="history-list__active"
              @click="select(version.id)"
            >
              <q-item-section>
                <q-item-label>
                  {{ formatDateTime(version.createdAt) }}
                  <span v-if="index === 0" class="history-now">τωρινή</span>
                </q-item-label>
                <q-item-label caption>{{ who(version) }}</q-item-label>
              </q-item-section>
              <q-item-section v-if="version.label" side>
                <q-badge rounded color="klados" :label="version.label" />
              </q-item-section>
            </q-item>
          </q-list>
        </div>

        <!-- Μία έκδοση, σε σύγκριση με την προηγούμενη -->
        <div v-show="!$q.screen.lt.sm || selected" class="col history-view">
          <div v-if="viewLoading" class="q-pa-md text-center"><q-spinner size="24px" /></div>
          <template v-else-if="selected">
            <div class="row items-center q-mb-md q-gutter-sm">
              <div class="col">
                <div class="text-weight-medium">{{ formatDateTime(selected.createdAt) }}</div>
                <div class="text-caption text-grey-7">
                  {{ selected.previous ? 'Οι αλλαγές από την προηγούμενη έκδοση' : 'Η πρώτη έκδοση' }}
                </div>
              </div>
              <SegmentedToggle
                v-model="showAll"
                dense flat no-caps size="sm"
                toggle-color="klados"
                :options="[
                  { label: 'Αλλαγές', value: false },
                  { label: 'Όλο', value: true },
                ]"
              />
              <q-btn
                v-if="writable && selected.id !== versions[0]?.id"
                unelevated
                dense
                no-caps
                color="klados"
                icon="restore"
                label="Επαναφορά"
                class="q-px-sm"
                :loading="restoring"
                @click="restore"
              />
            </div>

            <div v-if="!shownParts.length" class="text-caption text-grey-7">Καμία αλλαγή σε αυτή την έκδοση.</div>
            <div v-for="part in shownParts" :key="part.key" class="history-part">
              <div class="text-caption text-weight-medium text-grey-8 q-mb-xs">{{ part.label }}</div>
              <div v-if="!part.lines.length" class="text-caption text-grey-6">Κενό.</div>
              <div v-else class="history-diff">
                <div v-for="(line, index) in part.lines" :key="index" class="history-line" :class="`history-line--${line.kind}`">
                  <span class="history-line__sign" aria-hidden="true">{{ line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : '' }}</span>
                  <span class="history-line__text">
                    <template v-for="(segment, s) in line.segments" :key="s">
                      <ins v-if="segment.kind === 'add' && line.segments.length > 1">{{ segment.text }}</ins>
                      <del v-else-if="segment.kind === 'del' && line.segments.length > 1">{{ segment.text }}</del>
                      <template v-else>{{ segment.text || ' ' }}</template>
                    </template>
                  </span>
                </div>
              </div>
            </div>
          </template>
          <div v-else class="q-pa-md text-caption text-grey-7 gt-xs">Διάλεξε μια έκδοση.</div>
        </div>
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useQuasar } from 'quasar';
import type { CollabVersionSummary, CollabVersionView } from '@trifylli/shared';
import SegmentedToggle from '../SegmentedToggle.vue';
import { onDocumentChange } from '../../composables/useCollabDoc';
import { get, post } from '../../lib/api';
import { CLIENT_ID } from '../../lib/client-id';
import { formatDateTime } from '../../lib/format';
import { diffText, hasChanges, type DiffLine } from '../../lib/text-diff';

/**
 * Το ιστορικό ενός κοινού εγγράφου: οι εκδόσεις (πότε, ποιοι, ορόσημα), η
 * καθεμία σε σύγκριση με την προηγούμενη, και «Επαναφορά» για όποιον γράφει —
 * ως νέα αλλαγή, για όλους, με την τωρινή μορφή να μένει στο ιστορικό.
 */
const props = withDefaults(defineProps<{ document: string; writable?: boolean; compact?: boolean }>(), { writable: false, compact: false });

const $q = useQuasar();
const open = ref(false);
const loading = ref(false);
const viewLoading = ref(false);
const restoring = ref(false);
const versions = ref<CollabVersionSummary[]>([]);
const selected = ref<CollabVersionView | null>(null);
const showAll = ref(false);

function who(version: CollabVersionSummary): string {
  const names = version.writers.map((person) => `${person.firstName} ${person.lastName.charAt(0)}.`);
  if (!names.length) return version.label ? '' : '—';
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    versions.value = await get<CollabVersionSummary[]>('/versions', { params: { document: props.document } });
  } catch {
    $q.notify({ type: 'negative', message: 'Το ιστορικό δεν φορτώθηκε — δοκίμασε ξανά με δίκτυο.' });
  } finally {
    loading.value = false;
  }
}

async function select(id: string): Promise<void> {
  viewLoading.value = true;
  try {
    selected.value = await get<CollabVersionView>(`/versions/${id}`);
  } catch {
    $q.notify({ type: 'negative', message: 'Η έκδοση δεν φορτώθηκε.' });
  } finally {
    viewLoading.value = false;
  }
}

async function openDialog(): Promise<void> {
  open.value = true;
  selected.value = null;
  await load();
  if (!$q.screen.lt.sm && versions.value[0]) await select(versions.value[0].id);
}

const shownParts = computed<{ key: string; label: string; lines: DiffLine[] }[]>(() => {
  const version = selected.value;
  if (!version) return [];
  const before = new Map((version.previous ?? []).map((part) => [part.key, part.text]));
  const parts = version.parts.map((part) => ({
    key: part.key,
    label: part.label,
    lines: showAll.value || !version.previous
      ? (part.text ? part.text.split('\n').map((text): DiffLine => ({ kind: 'same', segments: [{ kind: 'same', text }] })) : [])
      : diffText(before.get(part.key) ?? '', part.text),
  }));
  return showAll.value || !version.previous ? parts.filter((part) => part.lines.length) : parts.filter((part) => hasChanges(part.lines));
});

function restore(): void {
  const version = selected.value;
  if (!version) return;
  $q.dialog({
    title: 'Επαναφορά',
    message: `Το έγγραφο θα γίνει όπως ήταν στις ${formatDateTime(version.createdAt)} — για όλους. Η τωρινή μορφή μένει στο ιστορικό.`,
    cancel: { flat: true, label: 'Άκυρο' },
    ok: { flat: true, color: 'klados', label: 'Επαναφορά' },
  }).onOk(async () => {
    restoring.value = true;
    try {
      await post(`/versions/${version.id}/restore`);
      $q.notify({ type: 'positive', message: 'Έγινε επαναφορά.' });
      await load();
      if (versions.value[0]) await select(versions.value[0].id);
    } catch {
      $q.notify({ type: 'negative', message: 'Η επαναφορά δεν έγινε.' });
    } finally {
      restoring.value = false;
    }
  });
}

// Κάποιος άλλος έκανε επαναφορά όσο είναι ανοιχτό: η λίστα ξαναφορτώνει.
const stop = onDocumentChange(props.document, (change) => {
  if (open.value && change.topic === 'versions' && change.origin !== CLIENT_ID) void load();
});
onBeforeUnmount(stop);
</script>

<style scoped lang="scss">
.history-card {
  width: min(980px, 96vw);
  max-width: 96vw;
  height: min(760px, 88vh);
}
.history-body {
  min-height: 0;
}
.history-list {
  width: 280px;
  flex: none;
  overflow-y: auto;
  border-right: 1px solid var(--line-soft);
}
.history-list--full {
  width: 100%;
  border-right: 0;
}
.history-list__active {
  background: color-mix(in srgb, var(--klados-ink) 12%, transparent);
  color: inherit;
}
.history-now {
  margin-left: 6px;
  font-size: 11px;
  color: var(--klados-ink);
  font-weight: 600;
}
.history-view {
  overflow-y: auto;
  padding: 16px;
  min-width: 0;
}
.history-part + .history-part {
  margin-top: 16px;
}
.history-diff {
  border-radius: 10px;
  background: var(--tint-soft);
  padding: 6px 0;
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.history-line {
  display: flex;
  padding: 0 10px;
}
.history-line__sign {
  width: 16px;
  flex: none;
  color: var(--text-soft);
}
.history-line__text {
  white-space: pre-wrap;
  min-width: 0;
}
.history-line--add {
  background: color-mix(in srgb, #43a047 16%, transparent);
}
.history-line--del {
  background: color-mix(in srgb, #e53935 14%, transparent);
}
.history-line ins {
  text-decoration: none;
  background: color-mix(in srgb, #43a047 38%, transparent);
  border-radius: 3px;
}
.history-line del {
  background: color-mix(in srgb, #e53935 34%, transparent);
  border-radius: 3px;
}
</style>
