<template>
  <div>
    <q-inner-loading :showing="loading && !view" />

    <q-tabs v-model="tab" dense no-caps align="left" class="q-mb-md" active-color="klados" indicator-color="klados" narrow-indicator>
      <q-tab name="schedule" icon="calendar_view_week" label="Χρονοδιάγραμμα" />
      <q-tab name="responsibles" icon="assignment_ind" label="Υπεύθυνοι" />
      <q-tab v-if="canEdit" name="settings" icon="tune" label="Ρυθμίσεις" />
    </q-tabs>

    <template v-if="view">
      <!-- ── Χρονοδιάγραμμα: ποια ομάδα έχει ποια υπηρεσία, ανά βάρδια ── -->
      <template v-if="tab === 'schedule'">
        <div v-if="!view.services.length" class="empty">
          <q-icon name="cleaning_services" size="40px" class="block q-mx-auto q-mb-sm" />
          Δεν υπάρχουν υπηρεσίες ακόμα.
          <q-btn v-if="canEdit" flat no-caps color="klados" label="Ενεργοποίηση από τις Ρυθμίσεις" class="q-mt-sm" @click="tab = 'settings'" />
        </div>
        <div v-else-if="!view.groups.length" class="empty">
          <q-icon name="diversity_3" size="40px" class="block q-mx-auto q-mb-sm" />
          Δεν υπάρχουν ομάδες. Φτιάξε πρώτα ενωμοτίες, φωλιές, πεντάδες ή ΟΕ — κάθε ομάδα παίρνει μια υπηρεσία σε κάθε βάρδια.
        </div>
        <template v-else>
          <div class="tf-toolbar q-mb-md">
            <div class="text-caption text-grey-7" style="flex: 1 1 260px">
              {{ rotationHint }}
            </div>
            <q-btn v-if="canEdit" unelevated no-caps color="klados" text-color="klados-on" icon="autorenew" label="Κυκλική κατανομή" class="q-ml-auto" :loading="busy" @click="confirmRotate" />
          </div>
          <div class="tf-card-grid" style="--tf-min: 260px">
            <div v-for="sh in view.shifts" :key="`${sh.date}:${sh.half}`">
              <q-card flat bordered class="full-height shift">
                <q-card-section class="q-pb-xs">
                  <div class="text-weight-medium">{{ shiftLabel(sh.date, sh.half) }}</div>
                </q-card-section>
                <q-list dense>
                  <q-item v-for="g in view.groups" :key="g.id">
                    <q-item-section>
                      <q-item-label class="ellipsis">{{ g.name }}</q-item-label>
                    </q-item-section>
                    <q-item-section side style="min-width: 0; max-width: 60%">
                      <q-select
                        v-if="canEdit"
                        :model-value="slotOf(sh.date, sh.half, g.id)"
                        :options="serviceOptions"
                        dense borderless emit-value map-options options-dense
                        color="klados" class="slot-select"
                        @update:model-value="(v: string | null) => setSlot(sh.date, sh.half, g.id, v)"
                      />
                      <span v-else class="slot-chip" :class="{ 'slot-chip--free': !slotOf(sh.date, sh.half, g.id) }">
                        {{ serviceName(slotOf(sh.date, sh.half, g.id)) || 'ελεύθερη' }}
                      </span>
                    </q-item-section>
                  </q-item>
                </q-list>
              </q-card>
            </div>
          </div>
        </template>
      </template>

      <!-- ── Υπεύθυνοι ── -->
      <template v-else-if="tab === 'responsibles'">
        <div v-if="!view.services.length" class="empty">Δεν υπάρχουν υπηρεσίες ακόμα.</div>
        <q-list v-else bordered separator class="rounded-borders">
          <q-item v-for="s in view.services" :key="s.id" class="q-py-sm">
            <q-item-section>
              <q-item-label class="text-weight-medium">{{ s.name }}</q-item-label>
              <StelexosPicker
                v-if="canEdit"
                :model-value="s.responsibles.map((r) => r.id)"
                label="Υπεύθυνο στέλεχος"
                :options="stelexiOptions"
                class="q-mt-xs"
                @update:model-value="(ids: string[]) => setResponsibles(s, ids)"
              />
              <template v-else>
                <q-item-label v-if="s.responsibles.length" caption>
                  <span v-for="(r, i) in s.responsibles" :key="r.id">
                    {{ i ? ', ' : '' }}{{ r.lastName }} {{ r.firstName }}
                    <a v-if="r.phone" :href="`tel:${r.phone}`" class="text-klados">{{ r.phone }}</a>
                  </span>
                </q-item-label>
                <q-item-label v-else caption class="text-warning">Χωρίς υπεύθυνο</q-item-label>
              </template>
            </q-item-section>
          </q-item>
        </q-list>
      </template>

      <!-- ── Ρυθμίσεις ── -->
      <template v-else-if="tab === 'settings' && canEdit">
        <q-card flat bordered class="q-mb-md">
          <q-card-section>
            <div class="text-subtitle2">Κύλιση</div>
            <div class="text-caption text-grey-7 q-mb-sm">
              Πόσο συχνά αλλάζει υπηρεσία κάθε ομάδα. Αν το αλλάξεις, το χρονοδιάγραμμα ξεκινά από την αρχή.
            </div>
            <SegmentedToggle
              :model-value="view.rotation"
              unelevated no-caps toggle-color="klados" toggle-text-color="klados-on"
              :options="ROTATION_OPTIONS"
              @update:model-value="(v: unknown) => setRotation(v as YpiresiesRotation)"
            />
          </q-card-section>
        </q-card>

        <q-card flat bordered class="q-mb-md">
          <q-card-section class="q-pb-none">
            <div class="text-subtitle2">Υπηρεσίες</div>
            <div class="text-caption text-grey-7">Ενεργοποίησε όσες ισχύουν σε αυτή τη δράση.</div>
          </q-card-section>
          <q-list>
            <q-item v-for="kind in DRASI_YPIRESIA_KINDS" :key="kind" tag="label">
              <q-item-section side><q-toggle :model-value="!!byKind(kind)" color="klados" @update:model-value="(on: boolean) => toggleBuiltin(kind, on)" /></q-item-section>
              <q-item-section>{{ DRASI_ROLE_LABEL[kind] }}</q-item-section>
            </q-item>
          </q-list>
        </q-card>

        <q-card flat bordered>
          <q-card-section class="q-pb-none">
            <div class="text-subtitle2">Πρόσθετες υπηρεσίες</div>
            <div class="text-caption text-grey-7">Ό,τι χρειάζεται η συγκεκριμένη δράση — π.χ. «Νερά», «Φωτιά», «Σημαιοστολισμός».</div>
          </q-card-section>
          <q-list>
            <q-item v-for="s in customs" :key="s.id">
              <q-item-section>
                <q-input :model-value="s.name" dense borderless color="klados" @change="(v: string) => rename(s, v)" />
              </q-item-section>
              <q-item-section side>
                <q-btn flat round dense icon="delete" color="negative" @click="removeService(s)"><q-tooltip>Αφαίρεση</q-tooltip></q-btn>
              </q-item-section>
            </q-item>
          </q-list>
          <q-card-section class="row items-center no-wrap q-gutter-sm">
            <q-input v-model="newName" dense outlined color="klados" placeholder="Νέα υπηρεσία" class="col" maxlength="60" @keyup.enter="addCustom" />
            <q-btn unelevated no-caps color="klados" text-color="klados-on" icon="add" label="Προσθήκη" :disable="newName.trim().length < 2" @click="addCustom" />
          </q-card-section>
        </q-card>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import {
  DRASI_ROLE_LABEL,
  DRASI_YPIRESIA_KINDS,
  YPIRESIES_ROTATION_LABEL,
  YpiresiesRotation,
  type DrasiExternalView,
  type DrasiRoleKind,
  type DrasiYpiresiaView,
  type DrasiYpiresiesView,
  type MemberSummary,
  type Paginated,
} from '@trifylli/shared';
import StelexosPicker from '../StelexosPicker.vue';
import { ApiError, del, get, patch, post, put } from '../../lib/api';
import { formatDate } from '../../lib/format';

const props = defineProps<{ drasiId: string; canEdit: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const $q = useQuasar();

const ROTATION_OPTIONS = (Object.keys(YPIRESIES_ROTATION_LABEL) as YpiresiesRotation[]).map((value) => ({ value, label: YPIRESIES_ROTATION_LABEL[value] }));

const tab = ref<'schedule' | 'responsibles' | 'settings'>('schedule');
const view = ref<DrasiYpiresiesView | null>(null);
const loading = ref(false);
const busy = ref(false);
const base = computed(() => `/draseis/${props.drasiId}/ypiresies`);

function fail(err: unknown, fallback: string): void {
  $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : fallback });
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    view.value = await get<DrasiYpiresiesView>(base.value);
  } catch (err) {
    fail(err, 'Οι υπηρεσίες δεν φόρτωσαν.');
  } finally {
    loading.value = false;
  }
}

// ── Χρονοδιάγραμμα ──
const serviceOptions = computed(() => [
  { label: '— ελεύθερη —', value: null },
  ...(view.value?.services ?? []).map((s) => ({ label: s.name, value: s.id })),
]);
const serviceName = (id: string | null): string => (id ? (view.value?.services.find((s) => s.id === id)?.name ?? '') : '');
const slotOf = (date: string, half: number, groupId: string): string | null =>
  view.value?.slots.find((s) => s.date === date && s.half === half && s.groupId === groupId)?.ypiresiaId ?? null;

function shiftLabel(date: string, half: number): string {
  if (view.value?.rotation === 'NONE') return 'Όλη η δράση';
  const day = new Date(`${date}T12:00:00`).toLocaleDateString('el-GR', { weekday: 'short' });
  return `${day} ${formatDate(date)}${view.value?.rotation === 'TWICE_DAILY' ? (half ? ' · απόγευμα' : ' · πρωί') : ''}`;
}
const rotationHint = computed(() => {
  switch (view.value?.rotation) {
    case 'NONE':
      return 'Σταθερές υπηρεσίες: κάθε ομάδα κρατά την ίδια για όλη τη δράση.';
    case 'TWICE_DAILY':
      return 'Κάθε ομάδα αλλάζει υπηρεσία δύο φορές τη μέρα (πρωί / απόγευμα).';
    default:
      return 'Κάθε ομάδα αλλάζει υπηρεσία κάθε μέρα.';
  }
});

async function setSlot(date: string, half: number, groupId: string, ypiresiaId: string | null): Promise<void> {
  try {
    view.value = await put<DrasiYpiresiesView>(`${base.value}/slots`, { slots: [{ date, half, groupId, ypiresiaId }] });
  } catch (err) {
    fail(err, 'Η αλλαγή δεν αποθηκεύτηκε.');
  }
}

function confirmRotate(): void {
  const proceed = () => void rotate();
  if (!view.value?.slots.length) return proceed();
  $q.dialog({
    title: 'Κυκλική κατανομή',
    message: 'Το χρονοδιάγραμμα ξαναφτιάχνεται από την αρχή: κάθε ομάδα περνά από τις υπηρεσίες εκ περιτροπής. Οι αλλαγές που έκανες με το χέρι χάνονται.',
    cancel: { flat: true, noCaps: true, label: 'Άκυρο' },
    ok: { unelevated: true, noCaps: true, color: 'klados', textColor: 'klados-on', label: 'Κατανομή' },
  }).onOk(proceed);
}
async function rotate(): Promise<void> {
  busy.value = true;
  try {
    view.value = await post<DrasiYpiresiesView>(`${base.value}/rotate`);
  } catch (err) {
    fail(err, 'Η κατανομή απέτυχε.');
  } finally {
    busy.value = false;
  }
}

// ── Υπεύθυνοι ──
const stelexi = ref<MemberSummary[]>([]);
const externals = ref<DrasiExternalView[]>([]);
const stelexiOptions = computed(() => [
  ...stelexi.value.map((s) => ({ label: `${s.lastName} ${s.firstName}`.trim(), value: s.id, caption: s.leaderTitle ?? '' })),
  ...externals.value.map((e) => ({ label: `${e.lastName} ${e.firstName}`.trim(), value: e.userId, caption: `Εξωτερικό${e.origin ? ` · ${e.origin}` : ''}` })),
]);
async function setResponsibles(s: DrasiYpiresiaView, userIds: string[]): Promise<void> {
  try {
    const services = await put<DrasiYpiresiaView[]>(`${base.value}/${s.id}/responsibles`, { userIds });
    if (view.value) view.value = { ...view.value, services };
    emit('changed');
  } catch (err) {
    fail(err, 'Οι υπεύθυνοι δεν αποθηκεύτηκαν.');
  }
}

// ── Ρυθμίσεις ──
const byKind = (kind: DrasiRoleKind) => view.value?.services.find((s) => s.kind === kind) ?? null;
const customs = computed(() => (view.value?.services ?? []).filter((s) => !s.kind));
const newName = ref('');

function applyServices(services: DrasiYpiresiaView[]): void {
  if (view.value) view.value = { ...view.value, services };
  emit('changed');
}

function setRotation(rotation: YpiresiesRotation): void {
  if (!view.value || rotation === view.value.rotation) return;
  const go = async () => {
    try {
      view.value = await put<DrasiYpiresiesView>(`${base.value}/settings`, { rotation });
    } catch (err) {
      fail(err, 'Η αλλαγή δεν αποθηκεύτηκε.');
    }
  };
  if (!view.value.slots.length) return void go();
  $q.dialog({
    title: 'Αλλαγή κύλισης',
    message: 'Οι βάρδιες αλλάζουν σχήμα, οπότε το χρονοδιάγραμμα σβήνεται και φτιάχνεται ξανά.',
    cancel: { flat: true, noCaps: true, label: 'Άκυρο' },
    ok: { unelevated: true, noCaps: true, color: 'klados', textColor: 'klados-on', label: 'Αλλαγή' },
  }).onOk(() => void go());
}

async function toggleBuiltin(kind: DrasiRoleKind, on: boolean): Promise<void> {
  try {
    const existing = byKind(kind);
    if (on && !existing) applyServices(await post<DrasiYpiresiaView[]>(base.value, { kind }));
    else if (!on && existing) applyServices(await del<DrasiYpiresiaView[]>(`${base.value}/${existing.id}`));
    await load();
  } catch (err) {
    fail(err, 'Η αλλαγή δεν αποθηκεύτηκε.');
  }
}
async function addCustom(): Promise<void> {
  const name = newName.value.trim();
  if (name.length < 2) return;
  try {
    applyServices(await post<DrasiYpiresiaView[]>(base.value, { name }));
    newName.value = '';
  } catch (err) {
    fail(err, 'Η υπηρεσία δεν προστέθηκε.');
  }
}
async function rename(s: DrasiYpiresiaView, value: string): Promise<void> {
  const name = String(value ?? '').trim();
  if (name.length < 2 || name === s.name) return;
  try {
    applyServices(await patch<DrasiYpiresiaView[]>(`${base.value}/${s.id}`, { name }));
  } catch (err) {
    fail(err, 'Η μετονομασία απέτυχε.');
  }
}
function removeService(s: DrasiYpiresiaView): void {
  $q.dialog({
    title: 'Αφαίρεση υπηρεσίας',
    message: `Η «${s.name}» φεύγει μαζί με τους υπευθύνους και τις βάρδιές της.`,
    cancel: { flat: true, noCaps: true, label: 'Άκυρο' },
    ok: { unelevated: true, noCaps: true, color: 'negative', label: 'Αφαίρεση' },
  }).onOk(() => {
    void (async () => {
      try {
        applyServices(await del<DrasiYpiresiaView[]>(`${base.value}/${s.id}`));
        await load();
      } catch (err) {
        fail(err, 'Η αφαίρεση απέτυχε.');
      }
    })();
  });
}

onMounted(async () => {
  await load();
  if (!props.canEdit) return;
  try {
    const [page, ext] = await Promise.all([
      get<Paginated<MemberSummary>>('/meloi', { params: { kind: 'STELEXOS', pageSize: 500 } }),
      get<DrasiExternalView[]>(`/draseis/${props.drasiId}/externals`).catch(() => [] as DrasiExternalView[]),
    ]);
    stelexi.value = page.items;
    externals.value = ext;
  } catch {
    // Χωρίς λίστα στελεχών οι επιλογείς μένουν άδειοι.
  }
});
</script>

<style scoped lang="scss">
.empty {
  text-align: center;
  color: var(--text-soft, #757575);
  padding: 28px 12px;
}
.slot-select {
  min-width: 140px;
  :deep(.q-field__native) {
    justify-content: flex-end;
    font-weight: 500;
    color: var(--klados-ink, var(--q-primary));
  }
}
.slot-chip {
  font-weight: 500;
  color: var(--klados-ink, var(--q-primary));
}
.slot-chip--free {
  color: var(--text-soft, #9e9e9e);
  font-weight: 400;
  font-style: italic;
}
</style>
