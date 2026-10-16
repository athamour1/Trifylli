<template>
  <q-card v-if="canPost || items.length" flat bordered class="q-mb-md">
    <q-card-section class="row items-center q-pb-xs">
      <q-icon name="campaign" size="20px" class="q-mr-sm text-klados" />
      <div class="text-subtitle2 col">Ανακοινώσεις</div>
      <q-btn v-if="canPost && !composing" flat dense no-caps color="klados" icon="add" label="Νέα" @click="composing = true" />
    </q-card-section>

    <!-- Νέα ανακοίνωση: σύντομο μήνυμα, σε όλους ή σε ρόλους — χωρίς απαντήσεις. -->
    <q-card-section v-if="composing" class="q-pt-xs">
      <q-input
        v-model="body"
        type="textarea"
        autogrow
        outlined
        dense
        autofocus
        color="klados"
        :maxlength="ANNOUNCEMENT_MAX"
        placeholder="π.χ. Αύριο ξεκινάμε στις 7:00 από την πλατεία."
        :input-style="{ minHeight: '56px' }"
      />
      <div class="row items-center q-gutter-sm q-mt-xs">
        <q-select
          v-model="roles"
          :options="roleOptions"
          multiple
          emit-value
          map-options
          use-chips
          dense
          outlined
          options-dense
          color="klados"
          label="Σε ποιους"
          :display-value="roles.length ? undefined : 'Όλα τα στελέχη'"
          class="col"
          style="min-width: 200px"
        />
        <q-btn flat dense no-caps label="Άκυρο" @click="cancel" />
        <q-btn unelevated dense no-caps color="klados" icon="send" label="Αποστολή" class="q-px-sm" :disable="!body.trim()" :loading="sending" @click="send" />
      </div>
      <div class="text-caption text-grey-7 q-mt-xs">Φτάνει ως ειδοποίηση — το push λέει μόνο ότι υπάρχει ανακοίνωση, όχι το κείμενο.</div>
    </q-card-section>

    <q-list v-if="items.length" separator class="q-pb-xs">
      <q-item v-for="item in shown" :key="item.id" :class="{ 'announcement--unseen': item.unseen }">
        <q-item-section>
          <q-item-label class="announcement__body">{{ item.body }}</q-item-label>
          <q-item-label caption>
            {{ item.by ? `${item.by.firstName} ${item.by.lastName.charAt(0)}.` : '' }} · {{ formatDateTime(item.at) }}
            <template v-if="item.roles.length"> · για {{ item.roles.map((role) => DRASI_ROLE_LABEL[role]).join(', ') }}</template>
          </q-item-label>
        </q-item-section>
        <q-item-section side top>
          <div class="row items-center no-wrap">
            <q-btn flat dense no-caps size="sm" icon="done_all" :label="`${seenCount(item)}/${item.audience.length}`">
              <q-tooltip>Το είδαν</q-tooltip>
              <q-menu anchor="bottom right" self="top right">
                <q-list dense style="min-width: 220px; max-height: 50vh" class="scroll">
                  <q-item-label header class="q-pb-xs">Το είδαν {{ seenCount(item) }}/{{ item.audience.length }}</q-item-label>
                  <q-item v-for="person in sortedAudience(item)" :key="person.id">
                    <q-item-section avatar style="min-width: 30px">
                      <q-icon :name="person.seenAt ? 'check_circle' : 'radio_button_unchecked'" :color="person.seenAt ? 'positive' : 'grey-5'" size="18px" />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label>{{ person.firstName }} {{ person.lastName }}</q-item-label>
                      <q-item-label v-if="person.seenAt" caption>{{ formatDateTime(person.seenAt) }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </q-btn>
            <q-btn v-if="canPost" flat round dense size="sm" icon="delete" color="negative" aria-label="Διαγραφή ανακοίνωσης" @click="remove(item.id)" />
          </div>
        </q-item-section>
      </q-item>
    </q-list>
    <q-card-actions v-if="items.length > LIMIT" align="center" class="q-pt-none">
      <q-btn flat dense no-caps size="sm" :label="all ? 'Λιγότερες' : `Όλες (${items.length})`" @click="all = !all" />
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import { ANNOUNCEMENT_MAX, DRASI_ROLE_LABEL, type DrasiAnnouncementView, type DrasiRoleKind } from '@trifylli/shared';
import { useLiveReload } from '../../composables/useLiveChanges';
import { del, get, post } from '../../lib/api';
import { formatDateTime } from '../../lib/format';

/**
 * Ανακοινώσεις προς τα στελέχη της δράσης, στην Επισκόπηση: όποιος τις βλέπει
 * σημειώνεται ότι τις είδε, και φαίνεται «το είδαν 6/9». Τις στέλνουν ο Αρχηγός
 * της δράσης και όποιος έχει τις Ρυθμίσεις. Χωρίς απαντήσεις.
 */
const props = defineProps<{ drasiId: string; canPost: boolean }>();

const LIMIT = 3;
const $q = useQuasar();
const items = ref<DrasiAnnouncementView[]>([]);
const all = ref(false);
const composing = ref(false);
const body = ref('');
const roles = ref<DrasiRoleKind[]>([]);
const sending = ref(false);

const roleOptions = (Object.keys(DRASI_ROLE_LABEL) as DrasiRoleKind[]).map((role) => ({ label: DRASI_ROLE_LABEL[role], value: role }));
const shown = computed(() => (all.value ? items.value : items.value.slice(0, LIMIT)));

const seenCount = (item: DrasiAnnouncementView) => item.audience.filter((person) => person.seenAt).length;
const sortedAudience = (item: DrasiAnnouncementView) =>
  [...item.audience].sort((a, b) => Number(!!b.seenAt) - Number(!!a.seenAt) || a.firstName.localeCompare(b.firstName, 'el'));

async function load(): Promise<void> {
  try {
    items.value = await get<DrasiAnnouncementView[]>(`/draseis/${props.drasiId}/announcements`);
  } catch {
    return;
  }
  // Όσες είναι για μένα και φαίνονται εδώ: τις είδα.
  const unseen = shown.value.filter((item) => item.unseen).map((item) => item.id);
  if (unseen.length) {
    try {
      await post(`/draseis/${props.drasiId}/announcements/seen`, { ids: unseen });
      for (const item of items.value) if (unseen.includes(item.id)) item.unseen = false;
    } catch {
      // Θα σημειωθούν την επόμενη φορά.
    }
  }
}

function cancel(): void {
  composing.value = false;
  body.value = '';
  roles.value = [];
}

async function send(): Promise<void> {
  sending.value = true;
  try {
    await post(`/draseis/${props.drasiId}/announcements`, { body: body.value.trim(), roles: roles.value });
    cancel();
    await load();
  } catch {
    $q.notify({ type: 'negative', message: 'Η ανακοίνωση δεν στάλθηκε — δοκίμασε ξανά με δίκτυο.' });
  } finally {
    sending.value = false;
  }
}

function remove(id: string): void {
  $q.dialog({
    title: 'Διαγραφή ανακοίνωσης',
    message: 'Θα φύγει για όλους.',
    cancel: { flat: true, label: 'Άκυρο' },
    ok: { flat: true, color: 'negative', label: 'Διαγραφή' },
  }).onOk(async () => {
    try {
      await del(`/draseis/${props.drasiId}/announcements/${id}`);
      await load();
    } catch {
      $q.notify({ type: 'negative', message: 'Δεν διαγράφηκε.' });
    }
  });
}

onMounted(load);
useLiveReload(['announcements'], load);
</script>

<style scoped lang="scss">
.announcement__body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.45;
}
.announcement--unseen {
  background: color-mix(in srgb, var(--klados-ink) 8%, transparent);
}
</style>
