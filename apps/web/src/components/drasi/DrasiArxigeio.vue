<template>
  <div>
    <!-- Δύο καρτέλες για όποιον επεξεργάζεται: ρόλοι και εξωτερικά στελέχη. -->
    <q-tabs v-if="canEdit" v-model="tab" dense no-caps align="left" class="q-mb-md" active-color="klados" indicator-color="klados" narrow-indicator>
      <q-tab name="roles" icon="shield" label="Ρόλοι" />
      <q-tab name="externals" icon="person_add_alt" :label="externals.length ? `Εξωτερικά στελέχη (${externals.length})` : 'Εξωτερικά στελέχη'" />
    </q-tabs>

    <!-- ── Εξωτερικά στελέχη ── -->
    <template v-if="canEdit && tab === 'externals'">
      <div class="tf-toolbar q-mb-md">
        <div class="text-caption text-grey-7" style="flex: 1 1 280px">
          Στελέχη που δεν είναι στο e-SEO του Τοπικού (π.χ. από άλλο Τοπικό). Παίρνουν email για κωδικό, βλέπουν τη δράση
          σύμφωνα με τον ρόλο που τους δίνεις στο αρχηγείο, και η πρόσβαση λήγει μόνη της όταν κλείσει η δράση.
        </div>
        <q-btn unelevated no-caps color="klados" text-color="klados-on" icon="person_add" label="Νέο εξωτερικό στέλεχος" class="q-ml-auto" @click="openExternal" />
      </div>
      <div v-if="!externals.length" class="text-center text-grey-6 q-pa-lg">
        <q-icon name="badge" size="40px" class="block q-mx-auto q-mb-sm" />
        Κανένα εξωτερικό στέλεχος.
      </div>
      <q-list v-else bordered separator class="rounded-borders">
        <q-item v-for="e in externals" :key="e.userId">
          <q-item-section style="min-width: 0">
            <q-item-label class="ellipsis">{{ e.lastName }} {{ e.firstName }}</q-item-label>
            <q-item-label caption class="ellipsis">{{ [e.email, e.phone, e.origin].filter(Boolean).join(' · ') }}</q-item-label>
            <div class="row items-center q-gutter-xs q-mt-xs">
              <q-badge :color="e.active ? 'positive' : 'orange-8'" :label="e.active ? 'Ενεργό' : 'Προσκλήθηκε'" />
              <q-chip v-for="r in e.roles" :key="r" dense square class="q-ma-none role-chip" :label="DRASI_ROLE_LABEL[r]" />
              <span v-if="!e.roles.length" class="text-caption text-warning">Χωρίς ρόλο — δώσε του από την καρτέλα «Ρόλοι»</span>
            </div>
          </q-item-section>
          <q-item-section side>
            <div class="row no-wrap items-center">
              <q-btn flat round dense icon="forward_to_inbox" color="klados" @click="resend(e)"><q-tooltip>Ξανά αποστολή πρόσκλησης</q-tooltip></q-btn>
              <q-btn flat round dense icon="person_remove" color="negative" @click="removeExternal(e)"><q-tooltip>Αφαίρεση από τη δράση</q-tooltip></q-btn>
            </div>
          </q-item-section>
        </q-item>
      </q-list>

      <q-dialog v-model="extDialog.open">
        <q-card style="width: 440px; max-width: 100%">
          <q-card-section class="text-h6">Νέο εξωτερικό στέλεχος</q-card-section>
          <q-card-section class="q-pt-none q-gutter-sm">
            <div class="row q-col-gutter-sm">
              <div class="col-6"><q-input v-model="extDialog.firstName" label="Όνομα *" outlined dense color="klados" autofocus /></div>
              <div class="col-6"><q-input v-model="extDialog.lastName" label="Επώνυμο *" outlined dense color="klados" /></div>
            </div>
            <q-input v-model="extDialog.email" type="email" label="Email *" outlined dense color="klados" hint="Εδώ φτάνει ο σύνδεσμος για τον κωδικό." />
            <q-input v-model="extDialog.phone" label="Τηλέφωνο" outlined dense color="klados" />
            <q-input v-model="extDialog.origin" label="Από πού έρχεται" placeholder="π.χ. Τοπικό Καλαμάτας" outlined dense color="klados" />
          </q-card-section>
          <q-card-actions align="right">
            <q-btn v-close-popup flat no-caps label="Άκυρο" :disable="extDialog.saving" />
            <q-btn unelevated no-caps color="klados" text-color="klados-on" label="Προσθήκη & πρόσκληση" :loading="extDialog.saving" @click="addExternal" />
          </q-card-actions>
        </q-card>
      </q-dialog>
    </template>

    <!-- ── Επεξεργασία ρόλων (αρχηγός δράσης / διαχείριση) ── -->
    <template v-else-if="canEdit">
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
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  DRASI_ARXIGEIO_KINDS,
  DRASI_ROLE_LABEL,
  DRASI_YPIRESIA_KINDS,
  DrasiRoleKind,
  type DrasiExternalCreated,
  type DrasiExternalView,
  type DrasiRoleView,
  type KladosType,
  type MemberSummary,
  type Paginated,
} from '@trifylli/shared';
import DrasiRolesEditor from './DrasiRolesEditor.vue';
import { emptyRoles, type RolesMap } from './types';
import { ApiError, del, get, post, put } from '../../lib/api';

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
/** Στελέχη του μητρώου + τα εξωτερικά της δράσης — όλοι μπορούν να πάρουν ρόλο. */
const stelexiOptions = computed(() => [
  ...stelexi.value.map((s) => ({ label: `${s.lastName} ${s.firstName}`.trim(), value: s.id, caption: s.leaderTitle ?? '' })),
  ...externals.value.map((e) => ({ label: `${e.lastName} ${e.firstName}`.trim(), value: e.userId, caption: `Εξωτερικό${e.origin ? ` · ${e.origin}` : ''}` })),
]);
onMounted(async () => {
  if (!props.canEdit) return;
  await loadExternals();
  try {
    stelexi.value = (await get<Paginated<MemberSummary>>('/meloi', { params: { kind: 'STELEXOS', pageSize: 500 } })).items;
  } catch {
    // Χωρίς λίστα στελεχών οι επιλογείς μένουν άδειοι — η προβολή δουλεύει.
  }
});

// ── Εξωτερικά στελέχη ──
const tab = ref<'roles' | 'externals'>('roles');
const externals = ref<DrasiExternalView[]>([]);
async function loadExternals(): Promise<void> {
  try {
    externals.value = await get<DrasiExternalView[]>(`/draseis/${props.drasiId}/externals`);
  } catch {
    externals.value = [];
  }
}
const extDialog = reactive({ open: false, saving: false, firstName: '', lastName: '', email: '', phone: '', origin: '' });
function openExternal(): void {
  Object.assign(extDialog, { open: true, saving: false, firstName: '', lastName: '', email: '', phone: '', origin: '' });
}
async function addExternal(): Promise<void> {
  if (!extDialog.firstName.trim() || !extDialog.lastName.trim() || !extDialog.email.trim()) {
    $q.notify({ type: 'warning', message: 'Όνομα, επώνυμο και email είναι υποχρεωτικά.' });
    return;
  }
  extDialog.saving = true;
  try {
    const r = await post<DrasiExternalCreated>(`/draseis/${props.drasiId}/externals`, {
      firstName: extDialog.firstName,
      lastName: extDialog.lastName,
      email: extDialog.email,
      ...(extDialog.phone.trim() ? { phone: extDialog.phone } : {}),
      ...(extDialog.origin.trim() ? { origin: extDialog.origin } : {}),
    });
    extDialog.open = false;
    $q.notify(
      r.invited
        ? { type: 'positive', icon: 'forward_to_inbox', message: `Στάλθηκε πρόσκληση στο ${r.external.email}. Δώσε του ρόλο από την καρτέλα «Ρόλοι».` }
        : { type: 'warning', message: `Προστέθηκε, αλλά η πρόσκληση δεν έφυγε: ${r.inviteError}` },
    );
    await loadExternals();
    emit('changed');
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Δεν προστέθηκε.' });
  } finally {
    extDialog.saving = false;
  }
}
async function resend(e: DrasiExternalView): Promise<void> {
  try {
    await post(`/draseis/${props.drasiId}/externals/${e.userId}/invite`);
    $q.notify({ type: 'positive', icon: 'forward_to_inbox', message: `Στάλθηκε ξανά στο ${e.email}.` });
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Η πρόσκληση δεν έφυγε.' });
  }
}
function removeExternal(e: DrasiExternalView): void {
  $q.dialog({
    title: 'Αφαίρεση από τη δράση',
    message: `Ο/Η ${e.lastName} ${e.firstName} βγαίνει από τη δράση και χάνει την πρόσβαση σε αυτήν.`,
    cancel: { flat: true, noCaps: true, label: 'Άκυρο' },
    ok: { unelevated: true, noCaps: true, color: 'negative', label: 'Αφαίρεση' },
  }).onOk(() => {
    void (async () => {
      try {
        await del(`/draseis/${props.drasiId}/externals/${e.userId}`);
        await loadExternals();
        emit('changed');
      } catch (err) {
        $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Αποτυχία.' });
      }
    })();
  });
}

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
.role-chip {
  border-radius: 8px;
  color: var(--klados-ink, var(--q-primary));
  background: color-mix(in srgb, var(--klados-color, var(--q-primary)) 12%, transparent);
}
.role-card--empty {
  border-style: dashed;
}
</style>
