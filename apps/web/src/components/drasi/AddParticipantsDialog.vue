<template>
  <!--
    Προσθήκη συμμετεχόντων. Δύο πηγές: το δικό μας μητρώο (φίλτρο κλάδου,
    αναζήτηση, πολλαπλή επιλογή) και οι φιλοξενούμενοι άλλων Τοπικών — όσοι
    έχουν ξανάρθει, ή νέος με το χέρι (το e-SEO δεν μας δίνει τα μέλη τους).
  -->
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="min-width: min(600px, 96vw); max-height: 90vh" class="column no-wrap">
      <q-card-section class="row items-center q-pb-sm">
        <div class="text-subtitle1 text-weight-medium">Προσθήκη συμμετεχόντων</div>
        <q-space />
        <q-btn flat round dense icon="close" v-close-popup />
      </q-card-section>

      <q-card-section class="q-pt-none q-pb-sm">
        <SegmentedToggle
          v-model="source"
          dense
          unelevated
          spread
          toggle-color="klados"
          toggle-text-color="klados-on"
          :options="[
            { label: 'Από το μητρώο', value: 'registry' },
            { label: 'Φιλοξενούμενοι', value: 'guests' },
          ]"
        />
      </q-card-section>

      <!-- ── Μητρώο ── -->
      <template v-if="source === 'registry'">
        <q-card-section class="q-pt-none">
          <div class="row q-col-gutter-sm">
            <div class="col-12 col-sm-5">
              <q-select v-model="filters.klados" :options="kladosOptions" label="Κλάδος" outlined dense emit-value map-options color="klados" />
            </div>
            <div class="col-12 col-sm-7">
              <q-input v-model="filters.q" label="Αναζήτηση" outlined dense clearable color="klados" debounce="300">
                <template #prepend><q-icon name="search" /></template>
              </q-input>
            </div>
          </div>
          <SegmentedToggle
            v-model="filters.kind"
            class="q-mt-sm"
            dense
            unelevated
            toggle-color="klados"
            toggle-text-color="klados-on"
            :options="[
              { label: 'Όλοι', value: '' },
              { label: 'Παιδιά', value: 'MELOS' },
              { label: 'Στελέχη', value: 'STELEXOS' },
            ]"
          />
        </q-card-section>

        <q-card-section class="col scroll q-pt-none">
          <q-inner-loading :showing="loading" />
          <div v-if="!loading && !candidates.length" class="text-grey-6 text-center q-pa-md">
            Κανένα μέλος για προσθήκη με αυτά τα φίλτρα.
          </div>
          <q-list v-else dense>
            <q-item v-for="m in candidates" :key="m.id" tag="label" clickable>
              <q-item-section side><q-checkbox v-model="selected" :val="m.id" color="klados" /></q-item-section>
              <q-item-section>
                <q-item-label>{{ m.lastName }} {{ m.firstName }}</q-item-label>
                <q-item-label caption>
                  {{ MEMBER_KIND_LABEL[m.kind] }}
                  <span v-if="m.kladosType"> · {{ KLADOS_LABEL[m.kladosType] }}</span>
                  <span v-if="m.age !== null"> · {{ m.age }} ετών</span>
                </q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Όλοι της λίστας" :disable="!candidates.length" @click="selected = candidates.map((c) => c.id)" />
          <q-space />
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn color="klados" text-color="klados-on" :label="`Προσθήκη (${selected.length})`" :disable="!selected.length" :loading="saving" @click="submitRegistry" />
        </q-card-actions>
      </template>

      <!-- ── Φιλοξενούμενοι ── -->
      <template v-else>
        <q-card-section class="col scroll q-pt-none">
          <q-input v-model="guestQuery" label="Αναζήτηση σε όσους έχουν ξανάρθει" outlined dense clearable color="klados" debounce="300">
            <template #prepend><q-icon name="search" /></template>
          </q-input>
          <q-list v-if="guestCandidates.length" dense class="q-mt-sm">
            <q-item v-for="g in guestCandidates" :key="g.id" tag="label" clickable>
              <q-item-section side><q-checkbox v-model="selectedGuests" :val="g.id" color="klados" /></q-item-section>
              <q-item-section>
                <q-item-label>{{ g.lastName }} {{ g.firstName }}</q-item-label>
                <q-item-label caption>
                  {{ g.guestTopikoName }} · {{ MEMBER_KIND_LABEL[g.kind] }}
                  <span v-if="g.participations"> · {{ g.participations }} δράσεις</span>
                </q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
          <div v-else-if="!guestLoading" class="text-caption text-grey-6 q-mt-sm">Κανένας φιλοξενούμενος για προσθήκη.</div>

          <q-separator class="q-my-md" />
          <div class="text-subtitle2 q-mb-xs">Νέος φιλοξενούμενος</div>
          <div class="row q-col-gutter-sm">
            <div class="col-12">
              <q-select
                v-model="guestForm.topiko"
                :options="topikoOptions"
                label="Τοπικό προέλευσης"
                outlined
                dense
                emit-value
                map-options
                color="klados"
                :hint="!guestTopika.length ? 'Δήλωσε πρώτα το Τοπικό στο «Στήσιμο → Ποιοι έρχονται».' : undefined"
              />
            </div>
            <div class="col-6"><q-input v-model="guestForm.lastName" label="Επώνυμο *" outlined dense color="klados" /></div>
            <div class="col-6"><q-input v-model="guestForm.firstName" label="Όνομα *" outlined dense color="klados" /></div>
            <div class="col-6">
              <SegmentedToggle
                v-model="guestForm.kind"
                dense
                unelevated
                spread
                toggle-color="klados"
                toggle-text-color="klados-on"
                :options="[
                  { label: 'Παιδί', value: 'MELOS' },
                  { label: 'Στέλεχος', value: 'STELEXOS' },
                ]"
              />
            </div>
            <div class="col-6"><DateField v-model="guestForm.birthDate" label="Ημ. γέννησης" /></div>
            <div class="col-6"><q-input v-model="guestForm.guardianName" label="Κηδεμόνας" outlined dense color="klados" /></div>
            <div class="col-6"><q-input v-model="guestForm.guardianPhone" label="Τηλέφωνο κηδεμόνα" outlined dense color="klados" /></div>
          </div>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Άκυρο" v-close-popup />
          <q-btn
            v-if="selectedGuests.length"
            color="klados"
            text-color="klados-on"
            :label="`Προσθήκη (${selectedGuests.length})`"
            :loading="saving"
            @click="submitGuests"
          />
          <q-btn
            v-else
            color="klados"
            text-color="klados-on"
            label="Δημιουργία & προσθήκη"
            :disable="!guestForm.topiko || !guestForm.firstName.trim() || !guestForm.lastName.trim()"
            :loading="saving"
            @click="submitNewGuest"
          />
        </q-card-actions>
      </template>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  KLADOS_LABEL,
  MEMBER_KIND_LABEL,
  type DrasiGuestTopikoView,
  type GuestMemberView,
  type KladosType,
  type MemberSummary,
  type Paginated,
} from '@trifylli/shared';
import DateField from '../DateField.vue';
import { ApiError, get, post } from '../../lib/api';

const props = defineProps<{
  modelValue: boolean;
  drasiId: string;
  /** Οι κλάδοι που συμμετέχουν — η προεπιλογή του φίλτρου. */
  kladoi: KladosType[];
  /** Τα φιλοξενούμενα Τοπικά της δράσης — οι επιλογές για νέο φιλοξενούμενο. */
  guestTopika: DrasiGuestTopikoView[];
  /** Όσοι είναι ήδη στη δράση. */
  existingIds: string[];
}>();
const emit = defineEmits<{ 'update:modelValue': [boolean]; added: [count: number] }>();

const $q = useQuasar();
const source = ref<'registry' | 'guests'>('registry');
const saving = ref(false);

// ── Μητρώο ──
const loading = ref(false);
const members = ref<MemberSummary[]>([]);
const selected = ref<string[]>([]);
const filters = reactive({ klados: '' as KladosType | '', q: '', kind: '' as '' | 'MELOS' | 'STELEXOS' });

const kladosOptions = computed(() => [
  { label: 'Όλοι οι κλάδοι', value: '' },
  ...props.kladoi.map((k) => ({ label: KLADOS_LABEL[k], value: k })),
]);
const candidates = computed(() => {
  const existing = new Set(props.existingIds);
  return members.value.filter((m) => !existing.has(m.id));
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    const page = await get<Paginated<MemberSummary>>('/meloi', {
      params: {
        pageSize: 300,
        ...(filters.klados ? { kladosType: filters.klados } : props.kladoi.length ? { kladosType: props.kladoi.join(',') } : {}),
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.kind ? { kind: filters.kind } : {}),
      },
    });
    members.value = page.items;
  } catch (err) {
    notifyError(err, 'Αποτυχία φόρτωσης μητρώου.');
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.modelValue, filters.klados, filters.q, filters.kind] as const,
  ([open]) => {
    if (open) void load();
    else {
      selected.value = [];
      selectedGuests.value = [];
    }
  },
  { immediate: true },
);

async function submitRegistry(): Promise<void> {
  await addIds(selected.value);
}

// ── Φιλοξενούμενοι ──
const guestQuery = ref('');
const guestLoading = ref(false);
const guests = ref<GuestMemberView[]>([]);
const selectedGuests = ref<string[]>([]);
const guestCandidates = computed(() => {
  const existing = new Set(props.existingIds);
  return guests.value.filter((g) => !existing.has(g.id));
});
const topikoOptions = computed(() => props.guestTopika.map((t) => ({ label: t.topikoName, value: t.topikoCode })));
const guestForm = reactive({
  topiko: '' as string,
  firstName: '',
  lastName: '',
  kind: 'MELOS' as 'MELOS' | 'STELEXOS',
  birthDate: '',
  guardianName: '',
  guardianPhone: '',
});

async function loadGuests(): Promise<void> {
  guestLoading.value = true;
  try {
    guests.value = await get<GuestMemberView[]>('/draseis/guests', { params: guestQuery.value ? { q: guestQuery.value } : {} });
  } catch (err) {
    notifyError(err, 'Αποτυχία φόρτωσης φιλοξενουμένων.');
  } finally {
    guestLoading.value = false;
  }
}
watch(
  () => [source.value, guestQuery.value] as const,
  ([s]) => {
    if (s === 'guests') void loadGuests();
  },
);
watch(
  () => props.guestTopika,
  (list) => {
    if (!guestForm.topiko && list[0]) guestForm.topiko = list[0].topikoCode;
  },
  { immediate: true },
);

async function submitGuests(): Promise<void> {
  await addIds(selectedGuests.value);
}

async function submitNewGuest(): Promise<void> {
  const topiko = props.guestTopika.find((t) => t.topikoCode === guestForm.topiko);
  if (!topiko) return;
  saving.value = true;
  try {
    await post(`/draseis/${props.drasiId}/guests`, {
      topikoCode: topiko.topikoCode,
      topikoName: topiko.topikoName,
      firstName: guestForm.firstName.trim(),
      lastName: guestForm.lastName.trim(),
      kind: guestForm.kind,
      birthDate: guestForm.birthDate ? new Date(`${guestForm.birthDate}T12:00:00`).toISOString() : undefined,
      guardianName: guestForm.guardianName.trim() || undefined,
      guardianPhone: guestForm.guardianPhone.trim() || undefined,
    });
    Object.assign(guestForm, { firstName: '', lastName: '', birthDate: '', guardianName: '', guardianPhone: '' });
    emit('added', 1);
    $q.notify({ type: 'positive', message: 'Ο φιλοξενούμενος προστέθηκε.' });
  } catch (err) {
    notifyError(err, 'Αποτυχία δημιουργίας.');
  } finally {
    saving.value = false;
  }
}

async function addIds(ids: string[]): Promise<void> {
  saving.value = true;
  try {
    const result = await post<{ added: number }>(`/draseis/${props.drasiId}/participants`, { memberIds: ids });
    emit('added', result.added);
    emit('update:modelValue', false);
    $q.notify({ type: 'positive', message: `Προστέθηκαν ${result.added}.` });
  } catch (err) {
    notifyError(err, 'Αποτυχία προσθήκης.');
  } finally {
    saving.value = false;
  }
}

function notifyError(err: unknown, fallback: string): void {
  $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : fallback });
}
</script>
