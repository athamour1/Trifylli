<template>
  <div>
    <!-- ── Επεξεργασία (αρχηγός δράσης / διαχείριση) ── -->
    <template v-if="canEdit">
      <q-card flat bordered class="q-mb-md">
        <q-card-section class="text-subtitle2 q-pb-xs">Αρχηγείο</q-card-section>
        <q-card-section class="q-pt-none">
          <DrasiRolesEditor section="arxigeio" v-model="roles" v-model:enabled="enabledServices" :stelexi-options="stelexiOptions" :organiser="organiser" />
        </q-card-section>
        <q-card-section class="text-subtitle2 q-pb-xs">Υπηρεσίες</q-card-section>
        <q-card-section class="q-pt-none">
          <DrasiRolesEditor section="ypiresies" v-model="roles" v-model:enabled="enabledServices" :stelexi-options="stelexiOptions" :organiser="organiser" />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn color="klados" text-color="klados-on" unelevated no-caps label="Αποθήκευση" :loading="saving" @click="save" />
        </q-card-actions>
      </q-card>
      <q-expansion-item dense icon="help_outline" label="Τι κάνει κάθε ρόλος" header-class="text-caption text-grey-7" class="q-mb-md">
        <q-list dense class="q-pl-md">
          <q-item v-for="kind in DRASI_ARXIGEIO_KINDS" :key="kind">
            <q-item-section avatar><q-icon :name="ROLE_ICON[kind] ?? 'person'" size="18px" class="role-card__icon" /></q-item-section>
            <q-item-section>
              <q-item-label>{{ DRASI_ROLE_LABEL[kind] }}</q-item-label>
              <q-item-label caption>{{ ROLE_SCOPE[kind] }}</q-item-label>
            </q-item-section>
          </q-item>
          <q-item>
            <q-item-section avatar><q-icon name="groups" size="18px" class="role-card__icon" /></q-item-section>
            <q-item-section>
              <q-item-label>Υπηρεσίες & υπόλοιπα στελέχη</q-item-label>
              <q-item-label caption>Βλέπουν τη δράση εκτός από ταμείο, υλικό και φαρμακείο.</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
      </q-expansion-item>
    </template>

    <!-- ── Ποιος κάνει τι (όσοι δεν επεξεργάζονται) ── -->
    <template v-else>
    <div class="text-subtitle1 text-weight-medium q-mb-sm">Ποιος κάνει τι</div>
    <div class="tf-card-grid" style="--tf-min: 260px">
      <div v-for="kind in DRASI_ARXIGEIO_KINDS" :key="kind">
        <q-card flat bordered class="full-height role-card" :class="{ 'role-card--empty': !holders(kind).length }">
          <q-card-section class="q-pb-xs">
            <div class="row items-center no-wrap">
              <q-icon :name="ROLE_ICON[kind] ?? 'person'" size="20px" class="q-mr-sm role-card__icon" />
              <div class="text-weight-medium col">{{ DRASI_ROLE_LABEL[kind] }}</div>
            </div>
            <div class="text-caption text-grey-7 q-mt-xs">{{ ROLE_SCOPE[kind] }}</div>
          </q-card-section>
          <q-card-section class="q-pt-xs">
            <div v-if="holders(kind).length" class="column q-gutter-xs">
              <div v-for="r in holders(kind)" :key="r.id" class="text-body2">
                {{ r.user.lastName }} {{ r.user.firstName }}
                <a v-if="r.user.phone" :href="`tel:${r.user.phone}`" class="text-caption text-klados q-ml-xs">{{ r.user.phone }}</a>
              </div>
            </div>
            <div v-else class="text-caption text-warning">Κανείς ακόμα</div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <template v-if="services.length">
      <div class="text-subtitle1 text-weight-medium q-mt-lg q-mb-xs">Υπηρεσίες</div>
      <div class="text-caption text-grey-7 q-mb-sm">Βλέπουν τη δράση εκτός από ταμείο, υλικό και φαρμακείο.</div>
      <q-list bordered separator class="rounded-borders">
        <q-item v-for="s in services" :key="s.kind">
          <q-item-section>
            <q-item-label>{{ DRASI_ROLE_LABEL[s.kind] }}</q-item-label>
            <q-item-label caption>{{ s.names.join(', ') }}</q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  DRASI_ARXIGEIO_KINDS,
  DRASI_ROLE_LABEL,
  DRASI_YPIRESIA_KINDS,
  DrasiRoleKind,
  type DrasiRoleView,
  type KladosType,
  type MemberSummary,
  type Paginated,
} from '@trifylli/shared';
import DrasiRolesEditor from './DrasiRolesEditor.vue';
import { emptyRoles, type RolesMap } from './types';
import { ApiError, get, put } from '../../lib/api';

const props = defineProps<{
  drasiId: string;
  roles: DrasiRoleView[];
  organiser: KladosType | null;
  canEdit: boolean;
}>();
const emit = defineEmits<{ changed: [] }>();
const $q = useQuasar();

/** Τι κάνει κάθε ρόλος — ίδιο με τον κανόνα του API (shared `drasiAccess`). */
const ROLE_SCOPE: Partial<Record<DrasiRoleKind, string>> = {
  ARXIGOS: 'Όλη τη δράση: αρχηγείο, ρυθμίσεις, κλείσιμο. Βλέπει το ταμείο.',
  PROGRAMMA: 'Μύθος και πρόγραμμα.',
  LEITOURGIA: 'Ομάδες, έντυπα, υλικό, αξιολόγηση. Βλέπει το ταμείο.',
  TAMIAS: 'Ταμείο, πληρωμές συμμετεχόντων, παράδοση μετρητών.',
  FARMAKEIO: 'Φαρμακεία και χαρτιά υγείας.',
  TROFODOSIA: 'Σύντομα δική της σελίδα.',
  MAGEIRISSA: 'Σύντομα δική της σελίδα.',
};
const ROLE_ICON: Partial<Record<DrasiRoleKind, string>> = {
  ARXIGOS: 'star',
  PROGRAMMA: 'auto_stories',
  LEITOURGIA: 'diversity_3',
  TAMIAS: 'account_balance_wallet',
  FARMAKEIO: 'medical_services',
  TROFODOSIA: 'shopping_basket',
  MAGEIRISSA: 'soup_kitchen',
};

const holders = (kind: DrasiRoleKind) => props.roles.filter((r) => r.kind === kind);
const services = computed(() =>
  DRASI_YPIRESIA_KINDS.map((kind) => ({ kind, names: holders(kind).map((r) => `${r.user.lastName} ${r.user.firstName}`) })).filter((s) => s.names.length),
);

// ── Επεξεργασία ──
const roles = ref<RolesMap>(emptyRoles(Object.values(DrasiRoleKind)));
const enabledServices = ref<DrasiRoleKind[]>([]);
watch(
  () => props.roles,
  (list) => {
    const next = emptyRoles(Object.values(DrasiRoleKind));
    for (const r of list) next[r.kind].push(r.user.id);
    roles.value = next;
    enabledServices.value = DRASI_YPIRESIA_KINDS.filter((k) => next[k].length > 0);
  },
  { immediate: true },
);

const stelexi = ref<MemberSummary[]>([]);
const stelexiOptions = computed(() =>
  stelexi.value.map((s) => ({ label: `${s.lastName} ${s.firstName}`.trim(), value: s.id, caption: s.leaderTitle ?? '' })),
);
onMounted(async () => {
  if (!props.canEdit) return;
  try {
    stelexi.value = (await get<Paginated<MemberSummary>>('/meloi', { params: { kind: 'STELEXOS', pageSize: 500 } })).items;
  } catch {
    // Χωρίς λίστα στελεχών οι επιλογείς μένουν άδειοι — η προβολή δουλεύει.
  }
});

const saving = ref(false);
async function save(): Promise<void> {
  saving.value = true;
  try {
    const payload: { kind: DrasiRoleKind; userId: string }[] = [];
    for (const kind of Object.values(DrasiRoleKind)) {
      if (DRASI_YPIRESIA_KINDS.includes(kind) && !enabledServices.value.includes(kind)) continue;
      for (const userId of roles.value[kind]) payload.push({ kind, userId });
    }
    await put(`/draseis/${props.drasiId}/roles`, { roles: payload });
    $q.notify({ type: 'positive', message: 'Το αρχηγείο αποθηκεύτηκε.' });
    emit('changed');
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία αποθήκευσης.' });
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped lang="scss">
.role-card__icon {
  color: var(--klados-ink, var(--q-primary));
}
.role-card--empty {
  border-style: dashed;
}
</style>
