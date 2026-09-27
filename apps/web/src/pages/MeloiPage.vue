<template>
  <q-page padding>
    <div class="page-title q-mb-md">{{ inKlados ? `Μέλη — ${kladosLabel}` : 'Μητρώο μελών' }}</div>

    <q-card flat bordered class="q-mb-md">
      <q-card-section class="row q-col-gutter-sm">
        <div class="col-12 col-sm-3">
          <q-input v-model="filters.q" label="Αναζήτηση" dense outlined clearable debounce="300" color="klados" />
        </div>
        <div v-if="!inKlados" class="col-6 col-sm-3">
          <q-select
            v-model="filters.kladosType"
            :options="kladosOptions"
            label="Κλάδος"
            dense
            outlined
            multiple
            emit-value
            map-options
            clearable
            color="klados"
          />
        </div>
        <div class="col-6 col-sm-2">
          <q-select
            v-model="filters.kind"
            :options="kindOptions"
            label="Είδος"
            dense
            outlined
            multiple
            emit-value
            map-options
            clearable
            color="klados"
          />
        </div>
        <div v-if="!inKlados" class="col-6 col-sm-3">
          <q-select
            v-model="filters.idiotita"
            :options="idiotitaOptions"
            label="Ιδιότητα"
            dense
            outlined
            multiple
            emit-value
            map-options
            clearable
            color="klados"
          />
        </div>
        <div class="col-3 col-sm-1">
          <q-input v-model.number="filters.ageMin" type="number" label="Ηλ. από" dense outlined color="klados" />
        </div>
        <div class="col-3 col-sm-1">
          <q-input v-model.number="filters.ageMax" type="number" label="Ηλ. έως" dense outlined color="klados" />
        </div>
        <div class="col-6 col-sm-2 flex items-center">
          <q-toggle v-model="filters.hasDebt" label="Με οφειλή" dense color="klados" />
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
      <div class="text-caption text-grey-7 q-mb-xs">{{ data?.items.length }} από {{ data?.total }}</div>

      <q-list bordered separator class="rounded-borders">
        <q-item
          v-for="member in data?.items"
          :key="member.id"
          clickable
          v-ripple
          :to="{ name: 'melos', params: { id: member.id } }"
        >
          <q-item-section avatar>
            <q-avatar color="grey-4" text-color="grey-9" size="36px">
              {{ initials(member) }}
            </q-avatar>
          </q-item-section>
          <q-item-section>
            <q-item-label>{{ member.lastName }} {{ member.firstName }}</q-item-label>
            <q-item-label caption>
              <span v-if="member.idiotita">{{ IDIOTITA_LABEL[member.idiotita] }}</span>
              <span v-else-if="member.kladosType">{{ KLADOS_LABEL[member.kladosType] }}</span>
              <span v-if="member.leaderTitle"> · {{ member.leaderTitle }}</span>
              <span v-if="member.subUnit"> · {{ member.subUnit }}</span>
              <span v-if="member.birthDate"> · {{ age(member.birthDate) }} ετών</span>
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <div class="row items-center q-gutter-xs">
              <q-badge v-if="member.isSOS" color="deep-orange-7" label="ΣΟΣ">
                <q-tooltip>Στέλεχος SOS (ενεργό πτυχίο)</q-tooltip>
              </q-badge>
              <q-badge
                v-if="member.kind === 'STELEXOS'"
                class="bg-klados text-klados-on"
                :label="MEMBER_KIND_LABEL[member.kind]"
              />
              <q-badge v-if="member.balanceDue > 0" color="negative" :label="formatEuro(member.balanceDue)" />
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </PageState>
  </q-page>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
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
import { useAsyncData } from '../composables/useAsyncData';
import { get } from '../lib/api';
import { formatEuro } from '../lib/format';
import { useKladosScope } from '../composables/useKladosScope';

const {
  klados: routeKlados,
  inKlados,
  label: kladosLabel,
  options: kladosOptions,
} = useKladosScope();

const filters = reactive({
  q: '',
  kladosType: null as KladosType[] | null,
  kind: null as MemberKind[] | null,
  idiotita: null as string[] | null,
  ageMin: null as number | null,
  ageMax: null as number | null,
  hasDebt: false,
  sos: false,
});

const kindOptions = toOptions(MEMBER_KIND_LABEL);
const idiotitaOptions = toOptions(IDIOTITA_LABEL);

/** Μέσα σε κλάδο το φίλτρο κλάδου είναι η διαδρομή, όχι επιλογή του χρήστη. */
const effectiveKladoi = computed<KladosType[] | null>(() =>
  routeKlados.value ? [routeKlados.value] : (filters.kladosType?.length ? filters.kladosType : null),
);

const { data, loading, error, stale, reload } = useAsyncData(
  () =>
    get<Paginated<MemberSummary>>('/meloi', {
      params: {
        pageSize: 200,
        ...(filters.q ? { q: filters.q } : {}),
        // Το API δέχεται και λίστα χωρισμένη με κόμμα — πιο σύντομο query string.
        ...(effectiveKladoi.value ? { kladosType: effectiveKladoi.value.join(',') } : {}),
        ...(filters.kind?.length ? { kind: filters.kind.join(',') } : {}),
        ...(filters.idiotita?.length ? { idiotita: filters.idiotita.join(',') } : {}),
        ...(filters.ageMin !== null ? { ageMin: filters.ageMin } : {}),
        ...(filters.ageMax !== null ? { ageMax: filters.ageMax } : {}),
        ...(filters.hasDebt ? { hasDebt: true } : {}),
        ...(filters.sos ? { sos: true } : {}),
      },
    }),
  { cacheKey: 'meloi', watchSources: [filters, effectiveKladoi] },
);

function initials(member: MemberSummary): string {
  return `${member.lastName.charAt(0)}${member.firstName.charAt(0)}`.toUpperCase();
}

function age(birthDate: string): number {
  const born = new Date(birthDate);
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const beforeBirthday =
    now.getMonth() < born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() < born.getDate());
  if (beforeBirthday) years -= 1;
  return years;
}
</script>
