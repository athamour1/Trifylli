<template>
  <div>
    <div class="row items-center q-mb-md q-gutter-sm">
      <div v-if="matrix" class="col-auto">
        <span class="text-h6" :class="matrix.pending ? 'text-orange-8' : 'text-positive'">{{ matrix.pending }}</span>
        <span class="text-grey-7"> από {{ matrix.total }} εκκρεμούν</span>
      </div>
      <q-space />
      <q-btn v-if="canWrite" flat color="klados" icon="send" label="Υπενθύμιση σε όσους εκκρεμούν" :loading="issuing" @click="issue({ reissue: true })" />
      <q-btn v-if="canWrite" color="klados" text-color="klados-on" unelevated icon="link" label="Έκδοση συνδέσμων" :loading="issuing" @click="issue({})" />
    </div>

    <q-banner rounded class="bg-grey-2 q-mb-md text-body2">
      <template #avatar><q-icon name="shield" color="grey-7" /></template>
      Κάθε σύνδεσμος ανοίγει <b>ένα</b> έντυπο <b>ενός</b> παιδιού, δεν δείχνει τίποτα άλλο, λήγει με την υποβολή
      ή σε {{ FORM_LINK_TTL_DAYS }} ημέρες, και κάθε άνοιγμα καταγράφεται. Τα στοιχεία υγείας σβήνονται
      {{ HEALTH_DATA_RETENTION_DAYS }} ημέρες μετά τη δράση.
    </q-banner>

    <q-inner-loading :showing="loading" />

    <q-markup-table v-if="matrix" flat bordered dense>
      <thead>
        <tr>
          <th class="text-left">Συμμετέχων</th>
          <th class="text-left">Δήλωση συμμετοχής</th>
          <th class="text-left">Κατάσταση υγείας</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in matrix.participants" :key="p.participantId">
          <td>
            {{ p.user.lastName }} {{ p.user.firstName }}
            <span class="text-caption text-grey-6">{{ p.isMinor ? '· ανήλικος' : '· ενήλικος' }}</span>
          </td>
          <td v-for="type in ['SYMMETOXI', 'YGEIA'] as const" :key="type">
            <template v-if="formOf(p, type)">
              <q-chip dense :color="statusColor(formOf(p, type)!.status)" text-color="white" :label="DRASI_FORM_STATUS_LABEL[formOf(p, type)!.status]" />
              <span v-if="formOf(p, type)!.submittedAt" class="text-caption text-grey-7">
                {{ formatDate(formOf(p, type)!.submittedAt!) }} · {{ formOf(p, type)!.signerName }}
              </span>
              <span v-else-if="formOf(p, type)!.sentAt" class="text-caption text-grey-7">έως {{ formatDate(formOf(p, type)!.expiresAt!) }}</span>
              <q-btn v-if="formOf(p, type)!.hasData" flat dense round size="sm" icon="visibility" color="klados" @click="view(formOf(p, type)!)"><q-tooltip>Προβολή</q-tooltip></q-btn>
              <q-btn v-if="canWrite && formOf(p, type)!.id && formOf(p, type)!.status !== 'SUBMITTED' && formOf(p, type)!.status !== 'VOID'" flat dense round size="sm" icon="link_off" color="negative" @click="voidForm(formOf(p, type)!)"><q-tooltip>Ακύρωση συνδέσμου</q-tooltip></q-btn>
              <q-btn v-if="canWrite && formOf(p, type)!.status !== 'SUBMITTED'" flat dense round size="sm" icon="refresh" color="klados" @click="issue({ participantIds: [p.participantId], types: [type], reissue: true })"><q-tooltip>Νέος σύνδεσμος</q-tooltip></q-btn>
            </template>
            <span v-else class="text-grey-5">—</span>
          </td>
        </tr>
      </tbody>
    </q-markup-table>

    <!-- ── Σύνδεσμοι που μόλις εκδόθηκαν: μία φορά ── -->
    <q-dialog v-model="linksDialog">
      <q-card style="min-width: min(640px, 96vw); max-height: 90vh" class="column no-wrap">
        <q-card-section class="row items-center q-pb-sm">
          <div class="text-subtitle1 text-weight-medium">Σύνδεσμοι ({{ links.length }})</div>
          <q-space />
          <q-btn flat round dense icon="close" v-close-popup />
        </q-card-section>
        <q-card-section class="text-caption text-grey-7 q-pt-none">
          Φαίνονται <b>μόνο τώρα</b> — αποθηκεύεται μόνο το αποτύπωμά τους. Στείλ' τους από εδώ ή αντίγραψέ τους.
        </q-card-section>
        <q-card-section class="col scroll q-pt-none">
          <q-list separator dense>
            <q-item v-for="l in links" :key="l.formId">
              <q-item-section>
                <q-item-label>{{ nameOf(l.participantId) }} — {{ DRASI_FORM_TYPE_LABEL[l.type] }}</q-item-label>
                <q-item-label caption class="ellipsis">{{ l.url }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <div class="row no-wrap">
                  <q-btn flat dense round icon="content_copy" @click="copy(l.url)"><q-tooltip>Αντιγραφή</q-tooltip></q-btn>
                  <q-btn flat dense round icon="share" :href="whatsapp(l)" target="_blank" rel="noopener"><q-tooltip>WhatsApp</q-tooltip></q-btn>
                </div>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Αντιγραφή όλων" @click="copy(links.map((l) => `${nameOf(l.participantId)} — ${DRASI_FORM_TYPE_LABEL[l.type]}: ${l.url}`).join('\n'))" />
          <q-btn color="klados" text-color="klados-on" label="Κλείσιμο" v-close-popup />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ── Προβολή απαντήσεων ── -->
    <q-dialog v-model="viewDialog">
      <q-card style="min-width: min(560px, 96vw)">
        <q-card-section class="q-pb-none">
          <div class="text-subtitle1 text-weight-medium">{{ viewed ? DRASI_FORM_TYPE_LABEL[viewed.type] : '' }}</div>
          <div class="text-caption text-grey-7" v-if="viewed">
            {{ viewed.participant.lastName }} {{ viewed.participant.firstName }} · υπέγραψε {{ viewed.signerName }}
            ({{ viewed.signerRole ? SIGNER_ROLE_LABEL[viewed.signerRole] : '' }}) · {{ viewed.submittedAt ? formatDateTime(viewed.submittedAt) : '' }}
          </div>
        </q-card-section>
        <q-card-section v-if="viewed">
          <div v-for="f in viewed.fields" :key="f.key" class="q-mb-sm">
            <div class="text-caption text-grey-7">{{ f.label }}</div>
            <div class="text-body2">{{ answerText(viewed.data?.[f.key]) }}</div>
          </div>
          <img v-if="signatureUrl" :src="signatureUrl" alt="Υπογραφή" style="max-width: 320px; border: 1px solid #ddd; border-radius: 6px" />
        </q-card-section>
        <q-card-actions align="right"><q-btn flat label="Κλείσιμο" v-close-popup /></q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useQuasar, copyToClipboard } from 'quasar';
import {
  DRASI_FORM_STATUS_LABEL,
  DRASI_FORM_TYPE_LABEL,
  FORM_LINK_TTL_DAYS,
  HEALTH_DATA_RETENTION_DAYS,
  SIGNER_ROLE_LABEL,
  type DrasiFormField,
  type DrasiFormStatus,
  type DrasiFormsMatrix,
  type DrasiFormType,
  type DrasiFormView,
  type IssuedFormLink,
  type SignerRole,
} from '@trifylli/shared';
import { ApiError, del, get, getBlob, post } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';

const props = defineProps<{ drasiId: string; canWrite: boolean }>();
const $q = useQuasar();
const loading = ref(false);
const issuing = ref(false);
const matrix = ref<DrasiFormsMatrix | null>(null);

type Row = DrasiFormsMatrix['participants'][number];
const formOf = (p: Row, type: DrasiFormType): DrasiFormView | undefined => p.forms.find((f) => f.type === type);
const names = computed(() => new Map((matrix.value?.participants ?? []).map((p) => [p.participantId, `${p.user.lastName} ${p.user.firstName}`])));
const nameOf = (pid: string) => names.value.get(pid) ?? '';

function statusColor(s: DrasiFormStatus): string {
  return { PENDING: 'grey-6', SENT: 'blue-7', OPENED: 'orange-7', SUBMITTED: 'positive', VOID: 'grey-8' }[s];
}

async function reload(): Promise<void> {
  loading.value = true;
  try {
    matrix.value = await get<DrasiFormsMatrix>(`/draseis/${props.drasiId}/forms`);
  } catch (err) {
    notifyError(err, 'Αποτυχία φόρτωσης εντύπων.');
  } finally {
    loading.value = false;
  }
}
onMounted(reload);

// ── Έκδοση ──
const links = ref<IssuedFormLink[]>([]);
const linksDialog = ref(false);
async function issue(body: { participantIds?: string[]; types?: DrasiFormType[]; reissue?: boolean }): Promise<void> {
  issuing.value = true;
  try {
    links.value = await post<IssuedFormLink[]>(`/draseis/${props.drasiId}/forms/issue`, body);
    if (!links.value.length) $q.notify({ type: 'info', message: 'Δεν υπάρχει τίποτα να σταλεί.' });
    else linksDialog.value = true;
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία έκδοσης.');
  } finally {
    issuing.value = false;
  }
}
function whatsapp(l: IssuedFormLink): string {
  const text = `Γεια σας! Για τη δράση χρειαζόμαστε συμπληρωμένο το έντυπο «${DRASI_FORM_TYPE_LABEL[l.type]}» για ${nameOf(l.participantId)}: ${l.url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
async function copy(text: string): Promise<void> {
  try {
    await copyToClipboard(text);
    $q.notify({ type: 'positive', message: 'Αντιγράφηκε.' });
  } catch {
    $q.notify({ type: 'warning', message: 'Δεν επιτρέπεται η αντιγραφή — επίλεξέ το με το χέρι.' });
  }
}

async function voidForm(f: DrasiFormView): Promise<void> {
  try {
    await del(`/draseis/${props.drasiId}/forms/${f.id}`);
    await reload();
  } catch (err) {
    notifyError(err, 'Αποτυχία.');
  }
}

// ── Προβολή ──
interface FormDetail extends DrasiFormView {
  participant: { firstName: string; lastName: string };
  data: Record<string, unknown> | null;
  signatureFileId: string | null;
  fields: DrasiFormField[];
  signerRole: SignerRole | null;
}
const viewDialog = ref(false);
const viewed = ref<FormDetail | null>(null);
const signatureUrl = ref('');
async function view(f: DrasiFormView): Promise<void> {
  try {
    viewed.value = await get<FormDetail>(`/draseis/${props.drasiId}/forms/${f.id}`);
    if (signatureUrl.value) URL.revokeObjectURL(signatureUrl.value);
    signatureUrl.value = '';
    if (viewed.value.signatureFileId) {
      try {
        signatureUrl.value = URL.createObjectURL(await getBlob(`/files/${viewed.value.signatureFileId}`));
      } catch {
        // Χωρίς εικόνα υπογραφής — τα στοιχεία αρκούν.
      }
    }
    viewDialog.value = true;
  } catch (err) {
    notifyError(err, 'Αποτυχία ανάγνωσης.');
  }
}
function answerText(v: unknown): string {
  if (v === true) return 'Ναι';
  if (v === false) return 'Όχι';
  return typeof v === 'string' && v ? v : '—';
}

function notifyError(err: unknown, fallback: string): void {
  $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : fallback });
}
</script>
