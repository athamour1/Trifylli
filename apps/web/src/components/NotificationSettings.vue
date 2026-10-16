<template>
  <q-card flat bordered class="q-mb-md">
    <q-card-section class="q-pb-sm">
      <div class="row items-center no-wrap q-gutter-sm">
        <q-icon name="notifications" size="22px" class="text-klados" />
        <div class="section-title">Ειδοποιήσεις</div>
      </div>
      <div class="text-caption text-grey-7 q-mt-xs">
        Φτάνουν στο καμπανάκι της μπάρας. Το push στο κινητό λέει μόνο τι έγινε και πού — ποτέ ονόματα παιδιών ή υγεία.
      </div>
    </q-card-section>

    <q-card-section class="q-pt-none">
      <q-item tag="label" class="q-px-none">
        <q-item-section>
          <q-item-label>Push σε αυτή τη συσκευή</q-item-label>
          <q-item-label caption>{{ pushHint }}</q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-toggle :model-value="push" :disable="!supported || busy" color="klados" @update:model-value="togglePush" />
        </q-item-section>
      </q-item>
    </q-card-section>

    <q-separator />
    <q-list>
      <q-item-label header class="q-pb-xs">Τι θέλω να μαθαίνω</q-item-label>
      <q-item v-for="setting in settings" :key="setting.kind" tag="label">
        <q-item-section>{{ setting.label }}</q-item-section>
        <q-item-section side>
          <q-toggle :model-value="setting.enabled" color="klados" @update:model-value="(value) => setKind(setting.kind, value)" />
        </q-item-section>
      </q-item>
    </q-list>
  </q-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import type { NotificationKind } from '@trifylli/shared';
import { get, put } from '../lib/api';
import { disablePush, enablePush, pushEnabled, pushSupported } from '../lib/push';

/** Push σε αυτή τη συσκευή και τα είδη ειδοποιήσεων του λογαριασμού (σελίδα /settings). */
const $q = useQuasar();
const supported = pushSupported();
const push = ref(false);
const busy = ref(false);
const settings = ref<{ kind: NotificationKind; label: string; enabled: boolean }[]>([]);

const pushHint = computed(() => {
  if (!supported) return 'Ο browser δεν το υποστηρίζει. Στο iPhone: πρώτα «Προσθήκη στην αρχική οθόνη».';
  if (push.value) return 'Ενεργό — ειδοποιήσεις και με κλειστή την εφαρμογή.';
  return 'Ανενεργό — οι ειδοποιήσεις μένουν στο καμπανάκι.';
});

onMounted(async () => {
  push.value = await pushEnabled().catch(() => false);
  try {
    settings.value = await get<typeof settings.value>('/notifications/settings');
  } catch {
    // Χωρίς δίκτυο: η λίστα θα φανεί την επόμενη φορά.
  }
});

async function togglePush(on: boolean): Promise<void> {
  busy.value = true;
  try {
    if (!on) {
      await disablePush();
      push.value = false;
      return;
    }
    const result = await enablePush();
    push.value = result === 'enabled';
    if (result === 'denied') $q.notify({ type: 'warning', message: 'Ο browser δεν επιτρέπει ειδοποιήσεις — άλλαξέ το από τις ρυθμίσεις του για αυτή τη σελίδα.' });
    if (result === 'unavailable') $q.notify({ type: 'warning', message: 'Το push δεν είναι ρυθμισμένο σε αυτόν τον server.' });
  } catch {
    $q.notify({ type: 'negative', message: 'Δεν έγινε — δοκίμασε ξανά με δίκτυο.' });
  } finally {
    busy.value = false;
  }
}

async function setKind(kind: NotificationKind, enabled: boolean): Promise<void> {
  const setting = settings.value.find((entry) => entry.kind === kind);
  if (setting) setting.enabled = enabled;
  try {
    await put(`/notifications/settings/${kind}`, { enabled });
  } catch {
    if (setting) setting.enabled = !enabled;
    $q.notify({ type: 'negative', message: 'Δεν αποθηκεύτηκε.' });
  }
}
</script>
