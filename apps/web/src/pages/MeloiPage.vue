<template>
  <q-page padding>
    <!-- Κλικ σε μέλος (μέσα σε κλάδο): κρύβεται ο πίνακας, εμφανίζονται inline τα
         στοιχεία με back button πάνω-αριστερά (βλ. openMember). -->
    <MemberDetailInline v-if="selectedId" :member-id="selectedId" @back="selectedId = null" />

    <template v-else>
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="row q-col-gutter-sm">
        <div class="col-12 col-sm-4">
          <q-input
            v-model="search"
            label="Αναζήτηση"
            dense
            outlined
            clearable
            color="klados"
            debounce="150"
          >
            <template #prepend><q-icon name="search" /></template>
          </q-input>
        </div>
        <div v-if="!inKlados" class="col-6 col-sm-3">
          <q-select
            v-model="filters.kladosType"
            :options="kladosOptions"
            label="Κλάδος"
            dense outlined multiple emit-value map-options clearable color="klados"
          />
        </div>
        <div class="col-6 col-sm-2">
          <q-select
            v-model="filters.kind"
            :options="kindOptions"
            label="Είδος"
            dense outlined multiple emit-value map-options clearable color="klados"
          />
        </div>
        <div v-if="!inKlados" class="col-6 col-sm-3">
          <q-select
            v-model="filters.idiotita"
            :options="idiotitaOptions"
            label="Ιδιότητα"
            dense outlined multiple emit-value map-options clearable color="klados"
          />
        </div>
        <div class="col-3 col-sm-1">
          <q-input v-model.number="filters.ageMin" type="number" label="Ηλ. από" dense outlined color="klados" />
        </div>
        <div class="col-3 col-sm-1">
          <q-input v-model.number="filters.ageMax" type="number" label="Ηλ. έως" dense outlined color="klados" />
        </div>
        <div v-if="!inKlados" class="col-6 col-sm-2 flex items-center">
          <q-toggle v-model="filters.sos" label="ΣΟΣ" dense color="deep-orange-7" />
        </div>
      </q-card-section>
    </q-card>

    <PageState
      :loading="loading"
      :error="error"
      :stale="stale"
      :empty="!data?.items.length"
      empty-text="Κανένα μέλος με αυτά τα φίλτρα."
      empty-icon="person_search"
      @retry="reload"
    >
      <!--
        Πλήρης λίστα (όλα τα μέλη) — η σελιδοποίηση, η ταξινόμηση και η αναζήτηση
        γίνονται στον browser, ώστε να είναι ακαριαία. Τα στρογγυλά ✓/✗ δείχνουν
        με μια ματιά GDPR, άδεια φωτό και επιβεβαιωμένη συνδρομή· κλικ στις
        κεφαλίδες = ταξινόμηση για γρήγορο εντοπισμό όσων λείπουν.
      -->
      <q-table
        :rows="data?.items ?? []"
        :columns="columns"
        row-key="id"
        flat bordered
        :loading="loading"
        :filter="search ?? ''"
        :filter-method="filterByName"
        v-model:pagination="pagination"
        :rows-per-page-options="[10, 20, 50, 100, 0]"
        :grid="$q.screen.lt.sm"
        wrap-cells
        @row-click="(_evt, row) => openMember(row)"
      >
        <template #body-cell-name="props">
          <q-td :props="props" class="cursor-pointer">
            <div class="row items-center no-wrap">
              <q-avatar color="grey-4" text-color="grey-9" size="34px" class="q-mr-sm">
                {{ initials(props.row) }}
              </q-avatar>
              <div class="column">
                <div class="text-weight-medium ellipsis">{{ props.row.lastName }} {{ props.row.firstName }}</div>
                <div class="text-caption text-grey-7 ellipsis">
                  <span v-if="props.row.idiotita">{{ IDIOTITA_LABEL[props.row.idiotita] }}</span>
                  <span v-else-if="props.row.kladosType">{{ kladosName(props.row.kladosType) }}</span>
                  <span v-if="props.row.subUnit"> · {{ props.row.subUnit }}</span>
                  <span v-if="props.row.leaderTitle"> · {{ props.row.leaderTitle }}</span>
                </div>
              </div>
            </div>
          </q-td>
        </template>

        <template #body-cell-age="props">
          <q-td :props="props" class="text-center">{{ props.row.age ?? '—' }}</q-td>
        </template>

        <template #body-cell-gdpr="props">
          <q-td :props="props" class="text-center"><ConsentMark :ok="props.row.gdprConsent" /></q-td>
        </template>
        <template #body-cell-photo="props">
          <q-td :props="props" class="text-center"><ConsentMark :ok="props.row.photoConsent" /></q-td>
        </template>
        <template #body-cell-syndromi="props">
          <q-td :props="props" class="text-center"><ConsentMark :ok="props.row.syndromiPaid" paid /></q-td>
        </template>

        <!-- Grid (κινητό): κάρτα ανά μέλος -->
        <template #item="props">
          <div class="q-pa-xs col-12 col-sm-6">
            <q-card flat bordered class="cursor-pointer" @click="openMember(props.row)">
              <q-card-section class="row items-center no-wrap q-pb-xs">
                <q-avatar color="grey-4" text-color="grey-9" size="36px" class="q-mr-sm">{{ initials(props.row) }}</q-avatar>
                <div class="col">
                  <div class="text-weight-medium ellipsis">{{ props.row.lastName }} {{ props.row.firstName }}</div>
                  <div class="text-caption text-grey-7 ellipsis">
                    <span v-if="props.row.idiotita">{{ IDIOTITA_LABEL[props.row.idiotita] }}</span>
                    <span v-else-if="props.row.kladosType">{{ kladosName(props.row.kladosType) }}</span>
                    <span v-if="props.row.subUnit"> · {{ props.row.subUnit }}</span>
                    <span v-if="props.row.age != null"> · {{ props.row.age }} ετών</span>
                  </div>
                </div>
              </q-card-section>
              <q-separator />
              <q-card-section class="row items-center justify-around q-py-sm">
                <div class="column items-center"><div class="text-caption text-grey-7">GDPR</div><ConsentMark :ok="props.row.gdprConsent" /></div>
                <div class="column items-center"><div class="text-caption text-grey-7">Φωτό</div><ConsentMark :ok="props.row.photoConsent" /></div>
                <div class="column items-center"><div class="text-caption text-grey-7">Συνδρομή</div><ConsentMark :ok="props.row.syndromiPaid" paid /></div>
              </q-card-section>
            </q-card>
          </div>
        </template>
      </q-table>
    </PageState>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar, type QTableColumn } from 'quasar';
import {
  IDIOTITA_LABEL,
  KLADOS_LABEL,
  MEMBER_KIND_LABEL,
  toOptions,
  type KladosType,
  type MemberKind,
  type MemberSummary,
  type Paginated,
} from '@trifylli/shared';
import PageState from '../components/PageState.vue';
import ConsentMark from '../components/ConsentMark.vue';
import MemberDetailInline from '../components/MemberDetailInline.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { get } from '../lib/api';
import { useKladosScope } from '../composables/useKladosScope';

const $q = useQuasar();
const router = useRouter();

const {
  klados: routeKlados,
  inKlados,
  options: kladosOptions,
} = useKladosScope();

/**
 * Μέσα σε κλάδο, το κλικ σε μέλος **δεν** αλλάζει σελίδα: κρύβει τον πίνακα και
 * δείχνει τα στοιχεία inline (με back button). Στο Τοπικό μένει η πλήρης καρτέλα.
 */
const selectedId = ref<string | null>(null);

/** Η αναζήτηση γίνεται στον browser (ακαριαία) — εκτός των server φίλτρων. */
const search = ref<string | null>('');

const filters = reactive({
  kladosType: null as KladosType[] | null,
  kind: null as MemberKind[] | null,
  idiotita: null as string[] | null,
  ageMin: null as number | null,
  ageMax: null as number | null,
  sos: false,
});

const pagination = ref({ sortBy: 'name', descending: false, page: 1, rowsPerPage: 20 });

const kindOptions = toOptions(MEMBER_KIND_LABEL);
const idiotitaOptions = toOptions(IDIOTITA_LABEL);

/** Μέσα σε κλάδο το φίλτρο κλάδου είναι η διαδρομή, όχι επιλογή του χρήστη. */
const effectiveKladoi = computed<KladosType[] | null>(() =>
  routeKlados.value ? [routeKlados.value] : (filters.kladosType?.length ? filters.kladosType : null),
);

const columns = computed<QTableColumn<MemberSummary>[]>(() => {
  const cols: QTableColumn<MemberSummary>[] = [
    {
      name: 'name',
      label: 'Όνομα',
      field: (r) => `${r.lastName} ${r.firstName}`,
      align: 'left',
      sortable: true,
    },
  ];
  if (!inKlados.value) {
    cols.push({
      name: 'klados',
      label: 'Κλάδος',
      field: (r) => (r.kladosType ? KLADOS_LABEL[r.kladosType] : '—'),
      align: 'left',
      sortable: true,
    });
  } else {
    cols.push({
      name: 'subUnit',
      label: 'Ενωμοτία',
      field: (r) => r.subUnit ?? '—',
      align: 'left',
      sortable: true,
    });
  }
  cols.push(
    { name: 'age', label: 'Ηλικία', field: 'age', align: 'center', sortable: true },
    { name: 'gdpr', label: 'GDPR', field: 'gdprConsent', align: 'center', sortable: true },
    { name: 'photo', label: 'Φωτό', field: 'photoConsent', align: 'center', sortable: true },
    { name: 'syndromi', label: 'Συνδρομή', field: 'syndromiPaid', align: 'center', sortable: true },
  );
  return cols;
});

const { data, loading, error, stale, reload } = useAsyncData(
  () =>
    get<Paginated<MemberSummary>>('/meloi', {
      params: {
        // Τα τραβάμε όλα μία φορά· σελιδοποίηση/ταξινόμηση/αναζήτηση στον browser.
        pageSize: 1000,
        ...(effectiveKladoi.value ? { kladosType: effectiveKladoi.value.join(',') } : {}),
        ...(filters.kind?.length ? { kind: filters.kind.join(',') } : {}),
        ...(filters.idiotita?.length ? { idiotita: filters.idiotita.join(',') } : {}),
        ...(filters.ageMin !== null ? { ageMin: filters.ageMin } : {}),
        ...(filters.ageMax !== null ? { ageMax: filters.ageMax } : {}),
        ...(filters.sos ? { sos: true } : {}),
      },
    }),
  { cacheKey: 'meloi', watchSources: [filters, effectiveKladoi] },
);

function filterByName(rows: readonly MemberSummary[], terms: string): readonly MemberSummary[] {
  const t = (terms ?? '').trim().toLowerCase();
  if (!t) return rows;
  return rows.filter((r) => `${r.lastName} ${r.firstName}`.toLowerCase().includes(t));
}

function kladosName(k: KladosType | null | undefined): string {
  return k ? KLADOS_LABEL[k] : '—';
}

function initials(member: MemberSummary): string {
  return `${member.lastName.charAt(0)}${member.firstName.charAt(0)}`.toUpperCase();
}

function openMember(member: MemberSummary): void {
  if (inKlados.value) {
    selectedId.value = member.id;
  } else {
    void router.push({ name: 'melos', params: { id: member.id } });
  }
}
</script>
