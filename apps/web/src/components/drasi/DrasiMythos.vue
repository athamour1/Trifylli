<template>
  <div class="mythos">
    <q-inner-loading :showing="loading && !view" />

    <!-- ── Ο μύθος: εξώφυλλο + ιστορία ── -->
    <q-card flat bordered class="mythos-book q-mb-md">
      <div class="mythos-book__cover">
        <q-icon name="auto_stories" class="mythos-book__icon" />
        <div class="col" style="min-width: 0">
          <div class="mythos-book__eyebrow">Ο μύθος της δράσης</div>
          <template v-if="!editing">
            <div v-if="view?.title" class="mythos-book__title">{{ view.title }}</div>
            <div v-else class="mythos-book__title mythos-book__title--empty">Χωρίς τίτλο ακόμα</div>
          </template>
          <q-input
            v-else
            v-model="draft.title"
            dense outlined color="klados" maxlength="200"
            placeholder="π.χ. Το χαμένο ημερολόγιο του Αργοναύτη"
            class="q-mt-xs"
          />
        </div>
        <q-btn
          v-if="canWrite && !editing"
          flat round dense icon="edit" color="klados" class="self-start"
          @click="startEdit"
        >
          <q-tooltip>Επεξεργασία μύθου</q-tooltip>
        </q-btn>
      </div>

      <q-card-section>
        <template v-if="editing">
          <MarkdownField
            v-model="draft.text"
            label="Η ιστορία"
            placeholder="Πώς ξεκινά, τι διακυβεύεται, πώς τελειώνει — ό,τι χρειάζεται ένα στέλεχος για να μπει στον κόσμο της δράσης."
            :min-height="180"
            :klados="organiser"
          />
          <div class="row justify-end q-gutter-sm q-mt-sm">
            <q-btn flat no-caps label="Άκυρο" :disable="saving" @click="editing = false" />
            <q-btn unelevated no-caps color="klados" text-color="klados-on" icon="save" label="Αποθήκευση" :loading="saving" @click="saveMythos" />
          </div>
        </template>
        <MarkdownField
          v-else-if="view?.text"
          :model-value="view.text"
          readonly
          :klados="organiser"
          class="mythos-book__story"
        />
        <div v-else class="mythos-empty">
          <div class="text-body2">Κάθε δράση έχει μια ιστορία που τη δένει.</div>
          <div class="text-caption text-grey-7">
            Γράψε εδώ την κεντρική ιδέα — τη βλέπουν μόνο τα στελέχη, τα παιδιά τη ζουν.
          </div>
          <q-btn
            v-if="canWrite"
            unelevated no-caps color="klados" text-color="klados-on" icon="edit_note" label="Γράψε τον μύθο"
            class="q-mt-md" @click="startEdit"
          />
        </div>
      </q-card-section>
    </q-card>

    <!-- ── Οι ρόλοι ── -->
    <div class="row items-center q-mb-sm">
      <div class="text-subtitle1 text-weight-medium col">
        Ρόλοι
        <span v-if="view?.characters.length" class="text-grey-7 text-weight-regular">· {{ assignedCount }}/{{ view.characters.length }} με στέλεχος</span>
      </div>
      <q-btn v-if="canWrite" unelevated no-caps color="klados" text-color="klados-on" icon="person_add" label="Νέος ρόλος" @click="openCharacter(null)" />
    </div>

    <div v-if="view && !view.characters.length" class="mythos-empty mythos-empty--roles">
      <q-icon name="theater_comedy" size="40px" color="klados" />
      <div class="text-body2 q-mt-sm">Κανένας ρόλος ακόμα.</div>
      <div class="text-caption text-grey-7">Ποιος είναι ο σοφός γέροντας, ποιος ο κακός, ποιος ο αγγελιοφόρος; Κάθε ρόλος παίρνει ένα στέλεχος.</div>
    </div>

    <div v-else-if="view" class="tf-card-grid" style="--tf-min: 280px">
      <div v-for="(c, i) in view.characters" :key="c.id">
        <q-card flat bordered class="character full-height column">
          <q-card-section class="row items-center no-wrap q-pb-sm">
            <q-avatar size="40px" class="bg-klados text-klados-on character__mark">{{ initial(c.name) }}</q-avatar>
            <div class="col q-ml-sm" style="min-width: 0">
              <div class="text-subtitle1 text-weight-medium ellipsis">{{ c.name }}</div>
              <div v-if="c.stelexos" class="text-caption ellipsis">
                <q-icon name="person" size="14px" class="q-mr-xs" />{{ fullName(c.stelexos) }}
              </div>
              <div v-else class="text-caption text-warning ellipsis">
                <q-icon name="person_off" size="14px" class="q-mr-xs" />Αδιάθετος
              </div>
            </div>
            <q-btn v-if="canWrite" flat round dense icon="more_vert" size="sm">
              <q-menu auto-close>
                <q-list dense style="min-width: 170px">
                  <q-item clickable @click="openCharacter(c)">
                    <q-item-section avatar><q-icon name="edit" /></q-item-section>
                    <q-item-section>Επεξεργασία</q-item-section>
                  </q-item>
                  <q-item clickable :disable="i === 0" @click="move(i, -1)">
                    <q-item-section avatar><q-icon name="arrow_upward" /></q-item-section>
                    <q-item-section>Πιο πάνω</q-item-section>
                  </q-item>
                  <q-item clickable :disable="i === view.characters.length - 1" @click="move(i, 1)">
                    <q-item-section avatar><q-icon name="arrow_downward" /></q-item-section>
                    <q-item-section>Πιο κάτω</q-item-section>
                  </q-item>
                  <q-separator />
                  <q-item clickable class="text-negative" @click="removeCharacter(c)">
                    <q-item-section avatar><q-icon name="delete" /></q-item-section>
                    <q-item-section>Διαγραφή</q-item-section>
                  </q-item>
                </q-list>
              </q-menu>
            </q-btn>
          </q-card-section>
          <q-separator inset />
          <q-card-section class="col q-pt-sm">
            <template v-if="c.lore">
              <div class="character__lore" :class="{ 'character__lore--clamp': isLong(c.lore), 'character__lore--open': expanded.has(c.id) }">
                <MarkdownField :model-value="c.lore" readonly :klados="organiser" />
              </div>
              <q-btn
                v-if="isLong(c.lore)"
                flat dense no-caps size="sm" color="klados" class="q-mt-xs"
                :label="expanded.has(c.id) ? 'Λιγότερα' : 'Όλο το lore'"
                @click="toggleLore(c.id)"
              />
            </template>
            <div v-else class="text-caption text-grey-6">Χωρίς lore ακόμα.</div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- ── Νέος / επεξεργασία ρόλου ── -->
    <q-dialog v-model="dialog.open" :maximized="$q.screen.lt.sm">
      <q-card style="width: 640px; max-width: 100%">
        <q-card-section class="text-h6">{{ dialog.id ? 'Ο ρόλος' : 'Νέος ρόλος' }}</q-card-section>
        <q-card-section class="q-pt-none q-gutter-md">
          <q-input
            v-model="dialog.name"
            label="Όνομα ρόλου" stack-label outlined dense color="klados" maxlength="80" autofocus
            placeholder="π.χ. Η Μάγισσα του δάσους"
          />
          <q-select
            v-model="dialog.participantId"
            :options="stelexosOptions"
            label="Το στέλεχος που τον παίζει"
            outlined dense color="klados" emit-value map-options clearable
            :hint="view?.stelexi.length ? 'Κενό ⇒ αδιάθετος ακόμα.' : 'Η δράση δεν έχει ακόμα στελέχη στους συμμετέχοντες.'"
          >
            <template #option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section>
                  <q-item-label>{{ scope.opt.label }}</q-item-label>
                  <q-item-label v-if="scope.opt.caption" caption>{{ scope.opt.caption }}</q-item-label>
                </q-item-section>
              </q-item>
            </template>
          </q-select>
          <MarkdownField
            v-model="dialog.lore"
            label="Lore"
            placeholder="Ποιος είναι, από πού έρχεται, τι θέλει, πώς μιλά, τι ξέρει που οι άλλοι δεν ξέρουν…"
            :min-height="160"
            :klados="organiser"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn v-close-popup flat no-caps label="Άκυρο" :disable="saving" />
          <q-btn unelevated no-caps color="klados" text-color="klados-on" :label="dialog.id ? 'Αποθήκευση' : 'Προσθήκη'" :loading="saving" @click="saveCharacter" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useQuasar } from 'quasar';
import type { DrasiCharacterView, DrasiMythosStelexos, DrasiMythosView, KladosType } from '@trifylli/shared';
import MarkdownField from '../MarkdownField.vue';
import { ApiError, del, get, patch, post, put } from '../../lib/api';

const props = defineProps<{ drasiId: string; organiser: KladosType | null; canWrite: boolean }>();
const $q = useQuasar();

const view = ref<DrasiMythosView | null>(null);
const loading = ref(false);
const saving = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  try {
    view.value = await get<DrasiMythosView>(`/draseis/${props.drasiId}/mythos`);
  } catch (err) {
    fail(err, 'Ο μύθος δεν φόρτωσε.');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function fail(err: unknown, fallback: string): void {
  $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : fallback });
}

const fullName = (s: DrasiMythosStelexos): string => `${s.firstName} ${s.lastName}`.trim();
const initial = (name: string): string => name.replace(/^(ο|η|το|οι|τα)\s+/i, '').trim().charAt(0).toUpperCase() || '?';
const assignedCount = computed(() => view.value?.characters.filter((c) => c.stelexos).length ?? 0);

// ── Ο μύθος ──
const editing = ref(false);
const draft = reactive({ title: '', text: '' });
function startEdit(): void {
  draft.title = view.value?.title ?? '';
  draft.text = view.value?.text ?? '';
  editing.value = true;
}
async function saveMythos(): Promise<void> {
  saving.value = true;
  try {
    view.value = await put<DrasiMythosView>(`/draseis/${props.drasiId}/mythos`, { title: draft.title, text: draft.text });
    editing.value = false;
  } catch (err) {
    fail(err, 'Ο μύθος δεν αποθηκεύτηκε.');
  } finally {
    saving.value = false;
  }
}

// ── Lore: κλειστό σε λίγες γραμμές, ανοίγει κατά βούληση ──
const expanded = ref(new Set<string>());
/** Πάνω από ~6 γραμμές κλείνει· τα σύντομα φαίνονται ολόκληρα χωρίς κουμπί. */
const isLong = (lore: string): boolean => lore.length > 320 || lore.split('\n').length > 6;
function toggleLore(id: string): void {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

// ── Ρόλοι ──
const dialog = reactive({ open: false, id: null as string | null, name: '', lore: '', participantId: null as string | null });

/** Τα στελέχη, με σημείωση όταν ήδη παίζουν άλλον ρόλο (επιτρέπεται, αλλά καλό να φαίνεται). */
const stelexosOptions = computed(() =>
  (view.value?.stelexi ?? []).map((s) => {
    const other = view.value?.characters.find((c) => c.stelexos?.participantId === s.participantId && c.id !== dialog.id);
    return { label: `${s.lastName} ${s.firstName}`.trim(), value: s.participantId, caption: other ? `Παίζει ήδη: ${other.name}` : '' };
  }),
);

function openCharacter(c: DrasiCharacterView | null): void {
  Object.assign(dialog, {
    open: true,
    id: c?.id ?? null,
    name: c?.name ?? '',
    lore: c?.lore ?? '',
    participantId: c?.stelexos?.participantId ?? null,
  });
}

async function saveCharacter(): Promise<void> {
  if (!dialog.name.trim()) {
    $q.notify({ type: 'warning', message: 'Ο ρόλος θέλει όνομα.' });
    return;
  }
  saving.value = true;
  try {
    const body = { name: dialog.name.trim(), lore: dialog.lore, participantId: dialog.participantId };
    if (dialog.id) await patch(`/draseis/${props.drasiId}/characters/${dialog.id}`, body);
    else await post(`/draseis/${props.drasiId}/characters`, { ...body, participantId: dialog.participantId ?? undefined });
    dialog.open = false;
    await load();
  } catch (err) {
    fail(err, 'Ο ρόλος δεν αποθηκεύτηκε.');
  } finally {
    saving.value = false;
  }
}

async function move(index: number, delta: -1 | 1): Promise<void> {
  if (!view.value) return;
  const list = [...view.value.characters];
  const [item] = list.splice(index, 1);
  if (!item) return;
  list.splice(index + delta, 0, item);
  // Αισιόδοξα: η κάρτα μετακινείται αμέσως, ο server επιβεβαιώνει.
  view.value = { ...view.value, characters: list };
  try {
    const characters = await put<DrasiCharacterView[]>(`/draseis/${props.drasiId}/characters/order`, { ids: list.map((c) => c.id) });
    view.value = { ...view.value, characters };
  } catch (err) {
    fail(err, 'Η σειρά δεν αποθηκεύτηκε.');
    await load();
  }
}

function removeCharacter(c: DrasiCharacterView): void {
  $q.dialog({
    title: 'Διαγραφή ρόλου',
    message: `Να σβηστεί ο ρόλος «${c.name}» μαζί με το lore του;`,
    cancel: { flat: true, label: 'Άκυρο', noCaps: true },
    ok: { color: 'negative', unelevated: true, label: 'Διαγραφή', noCaps: true },
  }).onOk(() => {
    void (async () => {
      try {
        await del(`/draseis/${props.drasiId}/characters/${c.id}`);
        await load();
      } catch (err) {
        fail(err, 'Ο ρόλος δεν σβήστηκε.');
      }
    })();
  });
}
</script>

<style scoped lang="scss">
.mythos-book {
  overflow: hidden;
}
// Εξώφυλλο: απαλή απόχρωση του κλάδου, σαν δεμένο βιβλίο.
.mythos-book__cover {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 18px 16px;
  background:
    radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--klados-color, var(--q-primary)) 22%, transparent), transparent 60%),
    linear-gradient(135deg, color-mix(in srgb, var(--klados-color, var(--q-primary)) 10%, var(--surface, #fff)), var(--surface, #fff));
  border-bottom: 1px solid var(--line-soft, rgba(0, 0, 0, 0.08));
}
.mythos-book__icon {
  flex: none;
  font-size: 30px;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  color: var(--klados-on, #fff);
  background: var(--klados-color, var(--q-primary));
  box-shadow: 0 6px 16px color-mix(in srgb, var(--klados-color, var(--q-primary)) 35%, transparent);
}
.mythos-book__eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--klados-ink, var(--q-primary));
}
.mythos-book__title {
  font-family: Georgia, 'Noto Serif', 'Times New Roman', serif;
  font-size: clamp(20px, 2.6vw, 26px);
  line-height: 1.2;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.mythos-book__title--empty {
  font-weight: 400;
  font-style: italic;
  opacity: 0.55;
}
.mythos-book__story :deep(.markdown-body) {
  font-size: 15px;
  line-height: 1.65;
}
// Πρώτο γράμμα της ιστορίας: αρχιγράμματο παραμυθιού.
.mythos-book__story :deep(.markdown-body > p:first-child::first-letter) {
  float: left;
  font-family: Georgia, 'Noto Serif', serif;
  font-size: 3.1em;
  line-height: 0.9;
  padding: 4px 8px 0 0;
  color: var(--klados-ink, var(--q-primary));
}

.mythos-empty {
  text-align: center;
  padding: 18px 8px;
}
.mythos-empty--roles {
  border: 1px dashed var(--line-strong, rgba(0, 0, 0, 0.2));
  border-radius: 14px;
  padding: 28px 16px;
}

.character__mark {
  font-family: Georgia, 'Noto Serif', serif;
  font-weight: 700;
  font-size: 20px;
}
// Το lore κλειστό σε ~6 γραμμές, με σβήσιμο στο κάτω μέρος.
.character__lore--clamp {
  position: relative;
  max-height: 9.5em;
  overflow: hidden;
  transition: max-height var(--dur-medium, 300ms) var(--ease-standard, ease);
  mask-image: linear-gradient(180deg, #000 60%, transparent);
}
.character__lore--open {
  max-height: 200em;
  mask-image: none;
}
</style>
