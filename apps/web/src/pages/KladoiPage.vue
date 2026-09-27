<template>
  <q-page padding>
    <div class="page-title q-mb-md">Κλάδοι</div>

    <PageState :loading="loading" :error="error" :stale="stale" :empty="!data?.length" @retry="reload">
      <div class="row q-col-gutter-md">
        <div v-for="k in data" :key="k.type" class="col-12 col-md-6">
          <q-card flat bordered class="klados-stripe" :style="{ color: k.color }">
            <q-card-section>
              <div class="row items-center justify-between">
                <div class="text-h6 text-dark">{{ k.label }}</div>
                <q-badge
                  :style="{ backgroundColor: k.color, color: readableOn(k.color) }"
                  :label="`${k.minAge}–${k.maxAge} ετών`"
                />
              </div>
              <div class="text-caption text-grey-7">{{ k.name }}</div>
            </q-card-section>

            <q-separator />

            <q-card-section class="row text-center text-dark">
              <div class="col">
                <div class="text-h6">{{ k.counts.meli }}</div>
                <div class="text-caption text-grey-7">Μέλη</div>
              </div>
              <div class="col">
                <div class="text-h6">{{ k.counts.stelexi }}</div>
                <div class="text-caption text-grey-7">Στελέχη</div>
              </div>
              <div class="col">
                <div class="text-h6">{{ k.counts.syggentrwseis }}</div>
                <div class="text-caption text-grey-7">Συγκεντρώσεις</div>
              </div>
              <div class="col">
                <div class="text-h6">{{ k.counts.yliko }}</div>
                <div class="text-caption text-grey-7">Υλικό</div>
              </div>
            </q-card-section>

            <q-card-section v-if="k.subUnits.length" class="q-pt-none">
              <div class="text-caption text-grey-7 q-mb-xs">{{ k.subUnitLabel }}</div>
              <q-chip v-for="unit in k.subUnits" :key="unit" dense outline size="sm">{{ unit }}</q-chip>
            </q-card-section>

            <q-card-section class="q-pt-none">
              <div class="text-caption text-grey-7 q-mb-xs">Διαχειριστής</div>
              <template v-if="k.admins.length">
                <q-chip
                  v-for="admin in k.admins"
                  :key="admin.id"
                  dense
                  size="sm"
                  icon="shield"
                  color="secondary"
                  text-color="white"
                >
                  {{ admin.lastName }} {{ admin.firstName }}
                </q-chip>
              </template>
              <q-chip v-else dense size="sm" color="orange-2" text-color="orange-10" icon="warning">
                Δεν έχει οριστεί
              </q-chip>
            </q-card-section>

            <q-card-actions align="right">
              <q-btn flat dense label="Μέλη" :to="{ name: 'klados-meloi', params: { klados: k.type } }" />
              <q-btn flat dense label="Πρόοδος" :to="{ name: 'klados-proodos', params: { klados: k.type } }" />
              <q-btn
                flat
                dense
                color="primary"
                label="Συγκεντρώσεις"
                :to="{ name: 'klados-syggentrwseis', params: { klados: k.type } }"
              />
            </q-card-actions>
          </q-card>
        </div>
      </div>
    </PageState>
  </q-page>
</template>

<script setup lang="ts">
import type { KladosType } from '@trifylli/shared';
import { readableOn } from '../lib/color';
import PageState from '../components/PageState.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { get } from '../lib/api';

interface KladosCard {
  id: string;
  type: KladosType;
  label: string;
  name: string | null;
  color: string;
  subUnitLabel: string;
  minAge: number;
  maxAge: number;
  counts: { meli: number; stelexi: number; total: number; yliko: number; draseis: number; syggentrwseis: number };
  subUnits: string[];
  admins: { id: string; firstName: string; lastName: string; email: string | null }[];
}

const { data, loading, error, stale, reload } = useAsyncData(() => get<KladosCard[]>('/kladoi'), {
  cacheKey: 'kladoi',
});
</script>
