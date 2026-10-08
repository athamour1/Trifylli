<template>
  <q-page padding>
    <PageState :loading="loading" :error="error" :stale="stale" :empty="!data?.members.length" empty-text="Ο κλάδος δεν έχει ακόμα στελέχη." empty-icon="shield" @retry="reload">
      <template v-if="data">
        <!-- ── Ποιος κρατά τι: μια ματιά σε όλες τις υπευθυνότητες ── -->
        <div class="text-subtitle1 text-weight-medium q-mb-sm">Υπευθυνότητες</div>
        <div class="tf-card-grid q-mb-lg" style="--tf-min: 200px">
          <div v-for="duty in DUTIES" :key="duty" class="duty-tile" :class="{ 'duty-tile--empty': !holders(duty).length }">
            <q-icon :name="KLADOS_DUTY_ICON[duty]" size="22px" class="duty-tile__icon" />
            <div class="col" style="min-width: 0">
              <div class="text-weight-medium">{{ KLADOS_DUTY_LABEL[duty] }}</div>
              <div v-if="holders(duty).length" class="text-caption ellipsis" :title="holders(duty).join(', ')">{{ holders(duty).join(', ') }}</div>
              <div v-else class="text-caption duty-tile__none">Κανείς ακόμα</div>
            </div>
          </div>
        </div>

        <!-- ── Τα στελέχη, ανά βαθμό ── -->
        <div v-for="group in groups" :key="group.key" class="q-mb-lg">
          <div class="row items-center q-mb-sm">
            <div class="text-subtitle1 text-weight-medium">{{ group.label }}</div>
            <q-badge rounded color="grey-6" class="q-ml-sm" :label="group.members.length" />
          </div>
          <div class="tf-card-grid" style="--tf-min: 280px">
            <div v-for="m in group.members" :key="m.userId">
              <q-card flat bordered class="leader full-height column" :class="{ 'leader--head': m.rank === 'ARCHIGOS' }">
                <q-card-section class="row items-center no-wrap q-pb-sm">
                  <div class="leader__avatar">
                    {{ initials(m) }}
                    <q-icon v-if="m.rank === 'ARCHIGOS'" name="star" class="leader__star" />
                  </div>
                  <div class="col q-ml-md" style="min-width: 0">
                    <router-link :to="{ name: 'melos', params: { id: m.userId } }" class="leader__name ellipsis">
                      {{ m.lastName }} {{ m.firstName }}
                    </router-link>
                    <div class="text-caption text-grey-7 ellipsis">{{ m.rankTitle ?? 'Στέλεχος — χωρίς θέση στο e-SEO' }}</div>
                  </div>
                  <q-btn v-if="canManage" flat round dense icon="edit" color="klados" @click="openEdit(m)">
                    <q-tooltip>Υπευθυνότητες</q-tooltip>
                  </q-btn>
                </q-card-section>
                <q-card-section class="col q-pt-none">
                  <div v-if="m.duties.length" class="row q-gutter-xs">
                    <q-chip
                      v-for="d in sortedDuties(m.duties)" :key="d"
                      dense square class="q-ma-none duty-chip"
                      :icon="KLADOS_DUTY_ICON[d]" :label="KLADOS_DUTY_LABEL[d]"
                    />
                  </div>
                  <div v-else class="text-caption text-grey-6">Χωρίς υπευθυνότητα</div>
                </q-card-section>
              </q-card>
            </div>
          </div>
        </div>

        <div class="text-caption text-grey-6">
          <q-icon name="info" size="14px" class="q-mr-xs" />
          Οι θέσεις έρχονται από τα πτυχία στο e-SEO. Τα στελέχη SOS δεν εμφανίζονται στο αρχηγείο.
        </div>
      </template>
    </PageState>

    <!-- ── Υπευθυνότητες ενός στελέχους ── -->
    <q-dialog v-model="edit.open">
      <q-card style="width: 460px; max-width: 100%">
        <q-card-section>
          <div class="text-h6">{{ edit.name }}</div>
          <div class="text-caption text-grey-7">Διάλεξε όσες υπευθυνότητες έχει — μπορεί να είναι περισσότερες από μία.</div>
        </q-card-section>
        <q-card-section class="q-pt-none">
          <div class="duty-picker">
            <button
              v-for="d in DUTIES" :key="d" type="button"
              class="duty-option" :class="{ 'duty-option--on': edit.duties.includes(d) }"
              :aria-pressed="edit.duties.includes(d)"
              @click="toggle(d)"
            >
              <q-icon :name="KLADOS_DUTY_ICON[d]" size="22px" />
              <span>{{ KLADOS_DUTY_LABEL[d] }}</span>
              <q-icon v-if="edit.duties.includes(d)" name="check_circle" size="16px" class="duty-option__check" />
            </button>
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-close-popup flat no-caps label="Άκυρο" :disable="edit.saving" />
          <q-btn unelevated no-caps color="klados" text-color="klados-on" label="Αποθήκευση" :loading="edit.saving" @click="save" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useQuasar } from 'quasar';
import {
  KLADOS_DUTY_ICON,
  KLADOS_DUTY_LABEL,
  KladosDuty,
  LEADER_RANK_LABEL,
  type ArxigeioMember,
  type ArxigeioView,
} from '@trifylli/shared';
import PageState from '../components/PageState.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { useKladosScope } from '../composables/useKladosScope';
import { ApiError, get, put } from '../lib/api';
import { useAuthStore } from '../stores/auth';

const $q = useQuasar();
const auth = useAuthStore();
const { klados } = useKladosScope();

const DUTIES = Object.values(KladosDuty);
const canManage = computed(() => (klados.value ? auth.can('meloi:manage', klados.value) : false));

const { data, loading, error, stale, reload } = useAsyncData(
  () => get<ArxigeioView>(`/kladoi/${klados.value}/arxigeio`),
  { cacheKey: `arxigeio:${klados.value}`, watchSources: [klados] },
);

const initials = (m: ArxigeioMember): string => `${m.firstName.charAt(0)}${m.lastName.charAt(0)}`.toUpperCase();
const sortedDuties = (duties: KladosDuty[]): KladosDuty[] => DUTIES.filter((d) => duties.includes(d));
/** Ποιοι κρατούν μια υπευθυνότητα — για τη σύνοψη πάνω. */
const holders = (duty: KladosDuty): string[] =>
  (data.value?.members ?? []).filter((m) => m.duties.includes(duty)).map((m) => `${m.firstName} ${m.lastName.charAt(0)}.`);

/** Ομάδες ανά βαθμό, με πληθυντικό όπου έχει νόημα. */
const groups = computed(() => {
  const members = data.value?.members ?? [];
  const by = (rank: ArxigeioMember['rank']) => members.filter((m) => m.rank === rank);
  const plural = (rank: 'ARCHIGOS' | 'YPARCHIGOS' | 'VOITHOS', n: number): string =>
    n === 1 ? LEADER_RANK_LABEL[rank]! : { ARCHIGOS: 'Αρχηγοί', YPARCHIGOS: 'Υπαρχηγοί', VOITHOS: 'Βοηθοί' }[rank];
  return [
    { key: 'ARCHIGOS', label: plural('ARCHIGOS', by('ARCHIGOS').length), members: by('ARCHIGOS') },
    { key: 'YPARCHIGOS', label: plural('YPARCHIGOS', by('YPARCHIGOS').length), members: by('YPARCHIGOS') },
    { key: 'VOITHOS', label: plural('VOITHOS', by('VOITHOS').length), members: by('VOITHOS') },
    { key: 'none', label: 'Στελέχη χωρίς θέση', members: by(null) },
  ].filter((g) => g.members.length);
});

// ── Επεξεργασία ──
const edit = reactive({ open: false, userId: '', name: '', duties: [] as KladosDuty[], saving: false });
function openEdit(m: ArxigeioMember): void {
  Object.assign(edit, { open: true, userId: m.userId, name: `${m.lastName} ${m.firstName}`, duties: [...m.duties] });
}
function toggle(d: KladosDuty): void {
  edit.duties = edit.duties.includes(d) ? edit.duties.filter((x) => x !== d) : [...edit.duties, d];
}
async function save(): Promise<void> {
  edit.saving = true;
  try {
    const updated = await put<ArxigeioMember>(`/kladoi/${klados.value}/arxigeio/${edit.userId}`, { duties: edit.duties });
    if (data.value) {
      data.value = { ...data.value, members: data.value.members.map((m) => (m.userId === updated.userId ? { ...m, duties: updated.duties } : m)) };
    }
    edit.open = false;
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Οι υπευθυνότητες δεν αποθηκεύτηκαν.' });
  } finally {
    edit.saving = false;
  }
}
</script>

<style scoped lang="scss">
.duty-tile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--line, rgba(0, 0, 0, 0.12));
  background: var(--surface, #fff);
}
.duty-tile__icon {
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  color: var(--klados-ink, var(--q-primary));
  background: color-mix(in srgb, var(--klados-color, var(--q-primary)) 14%, transparent);
}
// Κενή υπευθυνότητα: φαίνεται αμέσως ότι λείπει κάποιος.
.duty-tile--empty {
  border-style: dashed;
  .duty-tile__icon {
    color: var(--q-warning);
    background: color-mix(in srgb, var(--q-warning) 14%, transparent);
  }
}
.duty-tile__none {
  color: var(--q-warning);
}

.leader__avatar {
  position: relative;
  flex: none;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--klados-on, #fff);
  background: var(--klados-color, var(--q-primary));
}
.leader__star {
  position: absolute;
  right: -4px;
  bottom: -4px;
  font-size: 18px;
  color: #ffc107;
  background: var(--surface, #fff);
  border-radius: 50%;
  padding: 1px;
}
.leader--head {
  border-color: color-mix(in srgb, var(--klados-color, var(--q-primary)) 45%, transparent);
  background: color-mix(in srgb, var(--klados-color, var(--q-primary)) 5%, var(--surface, #fff));
}
.leader__name {
  display: block;
  font-weight: 600;
  color: inherit;
  text-decoration: none;
  &:hover {
    color: var(--klados-ink, var(--q-primary));
    text-decoration: underline;
  }
}
.duty-chip {
  color: var(--klados-ink, var(--q-primary));
  background: color-mix(in srgb, var(--klados-color, var(--q-primary)) 12%, transparent);
  border-radius: 8px;
}

.duty-picker {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 8px;
}
.duty-option {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 8px;
  border-radius: 14px;
  border: 1.5px solid var(--line, rgba(0, 0, 0, 0.12));
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  transition:
    border-color var(--dur-short, 150ms) var(--ease-standard, ease),
    background var(--dur-short, 150ms) var(--ease-standard, ease),
    transform var(--dur-short, 150ms) var(--ease-standard, ease);
  &:hover {
    background: var(--state-hover, rgba(0, 0, 0, 0.04));
  }
  &:active {
    transform: scale(0.97);
  }
}
.duty-option--on {
  border-color: var(--klados-color, var(--q-primary));
  color: var(--klados-ink, var(--q-primary));
  background: color-mix(in srgb, var(--klados-color, var(--q-primary)) 12%, transparent);
}
.duty-option__check {
  position: absolute;
  top: 6px;
  right: 6px;
}
</style>
