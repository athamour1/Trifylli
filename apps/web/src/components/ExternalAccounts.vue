<template>
  <div>
    <div class="text-caption text-grey-7 q-mb-md">
      Στελέχη άλλων Τοπικών με λογαριασμό για συγκεκριμένες δράσεις. Τα προσθέτει ο αρχηγός κάθε δράσης και η πρόσβαση
      λήγει μόνη της όταν κλείσει η δράση. Η ανάκληση τους βγάζει αμέσως — μένουν στις δράσεις τους ως στελέχη χωρίς
      πρόσβαση.
    </div>

    <PageState :loading="loading" :error="error" :stale="stale" @retry="reload">
      <div v-if="!data?.length" class="text-center text-grey-6 q-pa-lg">
        <q-icon name="badge" size="40px" class="block q-mx-auto q-mb-sm" />
        Κανένα εξωτερικό στέλεχος.
      </div>
      <q-list v-else bordered separator class="rounded-borders">
        <q-item v-for="e in data" :key="e.id">
          <q-item-section avatar>
            <q-avatar size="38px" color="grey-7" text-color="white" icon="badge" />
          </q-item-section>

          <q-item-section style="min-width: 0">
            <q-item-label class="ellipsis">{{ e.lastName }} {{ e.firstName }}</q-item-label>
            <q-item-label caption class="ellipsis">{{ [e.email, e.origin].filter(Boolean).join(' · ') }}</q-item-label>
            <div class="row items-center q-gutter-xs q-mt-xs">
              <q-icon :name="e.activated ? 'verified' : 'hourglass_empty'" :color="e.activated ? 'positive' : 'grey-5'" size="18px">
                <q-tooltip>{{ e.activated ? `Τελευταία σύνδεση: ${formatDateTime(e.lastLoginAt)}` : 'Δεν έχει συνδεθεί ακόμη' }}</q-tooltip>
              </q-icon>
              <!-- Οι δράσεις του, στο χρώμα του κλάδου τους· όσες έκλεισαν γκρι — εκεί δεν μπαίνει πια. -->
              <q-chip
                v-for="d in e.draseis"
                :key="d.id"
                dense
                clickable
                class="q-ma-none"
                :class="d.open ? 'bg-klados text-klados-on' : 'text-grey-6'"
                :outline="!d.open"
                :style="d.open ? kladosVars(d.klados) : undefined"
                icon="hiking"
                :label="d.title"
                @click="router.push({ name: 'drasi', params: { id: d.id } })"
              >
                <q-tooltip v-if="!d.open">Η δράση έκλεισε — εκεί δεν έχει πια πρόσβαση</q-tooltip>
              </q-chip>
            </div>
          </q-item-section>

          <q-item-section side class="row no-wrap items-center">
            <q-btn
              dense flat round
              :icon="passwordLinkButton(e.activated).icon"
              color="primary"
              :aria-label="passwordLinkButton(e.activated).label"
              @click="confirmPasswordLink($q, { email: e.email, activated: e.activated }, `/accounts/${e.id}/invite`)"
            >
              <q-tooltip>{{ passwordLinkButton(e.activated).label }}</q-tooltip>
            </q-btn>
            <q-btn dense flat round icon="person_remove" color="negative" aria-label="Ανάκληση πρόσβασης" @click="confirmRevoke(e)">
              <q-tooltip>Ανάκληση πρόσβασης</q-tooltip>
            </q-btn>
          </q-item-section>
        </q-item>
      </q-list>
    </PageState>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import type { ExternalAccountRow } from '@trifylli/shared';
import PageState from './PageState.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { ApiError, del, get } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { confirmPasswordLink, passwordLinkButton } from '../lib/password-link';
import { kladosVars } from '../lib/klados-theme';

const $q = useQuasar();
const router = useRouter();

const { data, loading, error, stale, reload } = useAsyncData(
  () => get<ExternalAccountRow[]>('/accounts/externals'),
  { cacheKey: 'accounts-externals' },
);

function confirmRevoke(e: ExternalAccountRow): void {
  $q.dialog({
    title: 'Ανάκληση πρόσβασης',
    message:
      `Ο/Η ${e.firstName} ${e.lastName} δεν θα μπορεί πλέον να συνδεθεί. Μένει στις δράσεις του ως στέλεχος χωρίς ` +
      'πρόσβαση, με όλο το ιστορικό — από το Αρχηγείο της δράσης μπορεί να ξαναπάρει. Συνέχεια;',
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Ανάκληση', color: 'negative' },
  }).onOk(() => void revoke(e.id));
}

async function revoke(id: string): Promise<void> {
  try {
    await del(`/accounts/${id}`);
    await reload();
    $q.notify({ type: 'positive', message: 'Η πρόσβαση ανακλήθηκε.' });
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία ανάκλησης.' });
  }
}
</script>
