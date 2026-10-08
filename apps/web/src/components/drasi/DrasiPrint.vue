<template>
  <!--
    Το ντοσιέ της δράσης στο χαρτί. Τρεις εκδοχές, γιατί δεν πάνε στα ίδια χέρια:
    «full» = ντοσιέ στελεχών (τα πάντα, μαζί με υγεία αν ζητήθηκε),
    «participants» = λίστα συμμετεχόντων χωρίς ιατρικά,
    «skines» = ποιος κοιμάται πού, μία σελίδα.
  -->
  <div class="print-sheet dossier">
    <header class="ds-head">
      <div class="ds-rule" :style="{ color: accent }" />
      <div class="ds-eyebrow">
        <span>{{ d.drasi.topiko }}</span>
        <span :style="{ color: accent }">{{ d.drasi.organiser ? KLADOS_LABEL[d.drasi.organiser] : 'Τοπικό' }}</span>
      </div>
      <h1 class="ds-title">{{ d.drasi.title }}</h1>
      <div class="ds-sub">
        {{ DRASI_TYPE_LABEL[d.drasi.type] }} · {{ formatDateRange(d.drasi.dateStart, d.drasi.dateEnd) }}
        <span v-if="d.drasi.location"> · {{ d.drasi.location }}</span>
        <span v-if="mode === 'participants'"> · Λίστα συμμετεχόντων</span>
        <span v-if="mode === 'skines'"> · Κατάταξη σε σκηνές</span>
      </div>
      <div class="ds-sub">
        Συμμετέχουν: {{ [...d.drasi.kladoi.map((k) => KLADOS_LABEL[k]), ...d.drasi.guestTopika.map((g) => g.topikoName)].join(', ') || '—' }}
      </div>
    </header>

    <!-- ── Αρχηγείο & υπηρεσίες ── -->
    <section v-if="mode === 'full' && roleGroups.length" class="ds-section">
      <h2 :style="{ color: accent }">Αρχηγείο &amp; υπηρεσίες</h2>
      <dl class="ds-facts">
        <div v-for="g in roleGroups" :key="g.kind" class="ds-fact">
          <dt>{{ DRASI_ROLE_LABEL[g.kind] }}</dt>
          <dd>{{ g.names.join(', ') }}</dd>
        </div>
      </dl>
    </section>

    <!-- ── Μύθος: η κεντρική ιδέα και ποιο στέλεχος παίζει ποιον ── -->
    <section v-if="mode === 'full' && d.mythos" class="ds-section">
      <h2 :style="{ color: accent }">Μύθος<span v-if="d.mythos.title">: {{ d.mythos.title }}</span></h2>
      <div v-if="d.mythos.text" class="markdown-body ds-md" v-html="md(d.mythos.text)" />
      <table v-if="d.mythos.characters.length" class="ds-table" style="margin-top: 8px">
        <thead><tr><th style="width: 22%">Ρόλος</th><th style="width: 22%">Στέλεχος</th><th>Lore</th></tr></thead>
        <tbody>
          <tr v-for="c in d.mythos.characters" :key="c.id">
            <td><b>{{ c.name }}</b></td>
            <td>{{ c.stelexos ? `${c.stelexos.lastName} ${c.stelexos.firstName}` : '—' }}</td>
            <td><div v-if="c.lore" class="markdown-body ds-md" v-html="md(c.lore)" /></td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- ── Πρόγραμμα: ωρολόγιο ανά ημέρα, με το προγραμματικό κάθε στοιχείου ── -->
    <section v-if="mode === 'full' && d.days.length" class="ds-section">
      <h2 :style="{ color: accent }">Πρόγραμμα</h2>
      <div v-for="(day, i) in d.days" :key="day.date" class="ds-day">
        <h3>Ημέρα {{ i + 1 }} <small>{{ formatDate(day.date) }}</small></h3>
        <table class="ds-table">
          <thead><tr><th style="width: 11%">Ώρα</th><th style="width: 35%">Τι γίνεται</th><th style="width: 16%">Διεξαγωγή</th><th style="width: 16%">Υλοποίηση</th><th>Υλικό</th></tr></thead>
          <tbody>
            <tr v-for="it in day.items" :key="it.id">
              <td>{{ formatTime(it.startsAt) }}<span v-if="it.endsAt">–{{ formatTime(it.endsAt) }}</span></td>
              <td>
                <b>{{ it.title }}</b><span v-if="it.location" class="ds-muted"> · {{ it.location }}</span>
                <span class="ds-tag">{{ DRASI_SCHEDULE_KIND_LABEL[it.kind] }}</span>
                <div v-if="it.description" class="markdown-body ds-md" v-html="md(it.description)" />
              </td>
              <td>{{ it.responsible ? `${it.responsible.lastName} ${it.responsible.firstName}` : '—' }}</td>
              <td>{{ it.executor ? `${it.executor.lastName} ${it.executor.firstName}` : '—' }}</td>
              <td>{{ [...it.yliko.map((y) => `${y.name}${y.qty > 1 ? ` ×${y.qty}` : ''}`), it.ylikoNotes ?? ''].filter(Boolean).join(', ') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ── Συμμετέχοντες ── -->
    <section v-if="mode !== 'skines'" class="ds-section">
      <h2 :style="{ color: accent }">Συμμετέχοντες <small>({{ d.participants.length }})</small></h2>
      <table class="ds-table">
        <thead>
          <tr>
            <th>#</th><th>Ονοματεπώνυμο</th><th>Κλάδος / Τοπικό</th><th>Ομάδα</th><th>Σκηνή</th><th>Τηλέφωνο</th>
            <th v-if="mode === 'full'">Συμμετοχή</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(p, i) in d.participants" :key="p.id">
            <td>{{ i + 1 }}</td>
            <td>{{ p.user.lastName }} {{ p.user.firstName }}<span v-if="p.kind === 'STELEXOS'" class="ds-tag">στέλεχος</span></td>
            <td>{{ p.user.kladosType ? KLADOS_LABEL[p.user.kladosType] : (p.user.guestTopikoName ?? '—') }}</td>
            <td>{{ p.groups.filter((g) => g.kind !== 'SKINI').map((g) => g.name).join(', ') || '—' }}</td>
            <td>{{ p.groups.find((g) => g.kind === 'SKINI')?.name ?? '—' }}</td>
            <td>{{ p.user.phone ?? '—' }}</td>
            <td v-if="mode === 'full'">{{ DRASI_FEE_KIND_LABEL[p.feeKind] }} · {{ formatEuro(p.paid) }}/{{ formatEuro(p.due) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- ── Σκηνές ── -->
    <section v-if="mode === 'skines' || (mode === 'full' && skines.length)" class="ds-section">
      <h2 :style="{ color: accent }">Σκηνές</h2>
      <div v-if="!skines.length" class="ds-muted">Δεν έχει γίνει κατάταξη σε σκηνές.</div>
      <div class="ds-grid">
        <div v-for="g in skines" :key="g.id" class="ds-card">
          <div class="ds-card-title">{{ g.name }} <small>{{ g.members.length }}</small></div>
          <ul>
            <li v-for="m in g.members" :key="m.participantId">
              {{ m.user.lastName }} {{ m.user.firstName }}
              <span v-if="g.leaderParticipantId === m.participantId" class="ds-tag">υπεύθυνος</span>
            </li>
          </ul>
        </div>
      </div>
      <div v-if="mode === 'skines' && unassignedSkini.length" class="ds-muted">
        Χωρίς σκηνή: {{ unassignedSkini.map((p) => `${p.user.lastName} ${p.user.firstName}`).join(', ') }}
      </div>
    </section>

    <!-- ── Ομάδες (πεντάδες/φωλιές/ενωμοτίες) ── -->
    <section v-if="mode === 'full' && groupsNoSkini.length" class="ds-section">
      <h2 :style="{ color: accent }">Ομάδες</h2>
      <div class="ds-grid">
        <div v-for="g in groupsNoSkini" :key="g.id" class="ds-card">
          <div class="ds-card-title">{{ g.name }} <small>{{ DRASI_GROUP_KIND_LABEL[g.kind] }}<span v-if="g.kladosType"> · {{ KLADOS_LABEL[g.kladosType] }}</span></small></div>
          <ul>
            <li v-for="m in g.members" :key="m.participantId">
              {{ m.user.lastName }} {{ m.user.firstName }}<span v-if="g.leaderParticipantId === m.participantId" class="ds-tag">ομαδάρχης</span>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- ── Σύνοψη υγείας ── -->
    <section v-if="mode === 'full' && d.health" class="ds-section ds-break">
      <h2 :style="{ color: accent }">Σύνοψη υγείας <small>— εμπιστευτικό, για την τσάντα πρώτων βοηθειών</small></h2>
      <div v-if="!d.health.length" class="ds-muted">Κανένα συμπληρωμένο έντυπο υγείας.</div>
      <table v-else class="ds-table">
        <thead><tr><th>Ονοματεπώνυμο</th><th>Αλλεργίες</th><th>Φάρμακα</th><th>Παθήσεις</th><th>Διατροφή</th><th>Έκτ. ανάγκη</th></tr></thead>
        <tbody>
          <tr v-for="h in d.health" :key="h.participantId">
            <td><b>{{ h.user.lastName }} {{ h.user.firstName }}</b><div v-if="h.skini" class="ds-muted">{{ h.skini }}</div></td>
            <td>{{ h.allergies || '—' }}</td><td>{{ h.medications || '—' }}</td><td>{{ h.conditions || '—' }}</td><td>{{ h.diet || '—' }}</td><td>{{ h.emergencyPhone || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- ── Υλικό ── -->
    <section v-if="mode === 'full' && (d.loading.shopping.length || d.loading.checkouts.length || d.loading.external.length)" class="ds-section">
      <h2 :style="{ color: accent }">Υλικό — λίστα φόρτωσης</h2>
      <div class="ds-grid ds-grid-3">
        <div v-if="d.loading.checkouts.length" class="ds-card">
          <div class="ds-card-title">Από τις αποθήκες</div>
          <ul><li v-for="c in d.loading.checkouts" :key="c.id">☐ {{ c.name }} × {{ c.qty }} {{ c.unit ?? '' }}</li></ul>
        </div>
        <div v-if="d.loading.shopping.length" class="ds-card">
          <div class="ds-card-title">Αγορές</div>
          <ul><li v-for="s in d.loading.shopping" :key="s.id">{{ s.purchasedAt ? '☑' : '☐' }} {{ s.name }} × {{ s.qty }}<small v-if="s.assignee"> ({{ s.assignee.lastName }})</small></li></ul>
        </div>
        <div v-if="d.loading.external.length" class="ds-card">
          <div class="ds-card-title">Φέρνουν άλλοι — να επιστραφούν</div>
          <ul><li v-for="x in d.loading.external" :key="x.id">{{ x.returnedAt ? '☑' : '☐' }} {{ x.name }} × {{ x.qty }}<small> ({{ x.owner.guestTopiko?.name ?? (x.owner.kladosType ? KLADOS_LABEL[x.owner.kladosType] : '') }})</small></li></ul>
        </div>
      </div>
    </section>

    <!-- ── Ταμείο ── -->
    <section v-if="mode === 'full' && d.treasury" class="ds-section ds-break">
      <h2 :style="{ color: accent }">Ταμείο</h2>
      <dl class="ds-facts">
        <div class="ds-fact"><dt>Έσοδα</dt><dd>{{ formatEuro(d.treasury.summary.income) }} <small>(συμμετοχές {{ formatEuro(d.treasury.summary.incomeFromPayments) }})</small></dd></div>
        <div class="ds-fact"><dt>Έξοδα</dt><dd>{{ formatEuro(d.treasury.summary.expense) }}</dd></div>
        <div class="ds-fact"><dt>Υπόλοιπο</dt><dd><b>{{ formatEuro(d.treasury.summary.balance) }}</b></dd></div>
        <div class="ds-fact"><dt>Ανείσπρακτα</dt><dd>{{ formatEuro(d.treasury.summary.fees.outstanding) }}</dd></div>
      </dl>
      <table class="ds-table">
        <thead><tr><th>Κατηγορία</th><th class="r">Προϋπολογισμός</th><th class="r">Πραγματικό</th><th class="r">%</th><th class="r">Στόχος</th></tr></thead>
        <tbody>
          <tr v-for="c in d.treasury.summary.expenses" :key="c.category">
            <td>{{ TREASURY_CATEGORY_LABEL[c.category] ?? c.category }}</td>
            <td class="r">{{ c.planned ? formatEuro(c.planned) : '—' }}</td>
            <td class="r">{{ formatEuro(c.actual) }}</td>
            <td class="r">{{ Math.round(c.actualPct * 100) }}%</td>
            <td class="r">{{ c.targetPct !== null ? `${Math.round(c.targetPct * 100)}%` : '—' }}</td>
          </tr>
        </tbody>
      </table>
      <table v-if="d.treasury.entries.length" class="ds-table ds-small">
        <thead><tr><th>Ημερομηνία</th><th>Κατηγορία</th><th>Αιτιολογία</th><th class="r">Ποσό</th></tr></thead>
        <tbody>
          <tr v-for="e in d.treasury.entries" :key="e.id">
            <td>{{ formatDate(e.occurredAt) }}</td><td>{{ TREASURY_CATEGORY_LABEL[e.category] ?? e.category }}</td><td>{{ e.description ?? '' }}</td>
            <td class="r">{{ e.kind === 'INCOME' ? '+' : '−' }}{{ formatEuro(e.amount) }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- ── Συμβούλια ── -->
    <section v-if="mode === 'full' && d.symvoulia.length" class="ds-section ds-break">
      <h2 :style="{ color: accent }">Συμβούλια προετοιμασίας</h2>
      <div v-for="s in d.symvoulia" :key="s.id" class="ds-day">
        <h3>{{ s.title ?? 'Συμβούλιο' }} <small>{{ formatDate(s.date) }}<span v-if="s.finalized"> · πρακτικά εγκεκριμένα</span></small></h3>
        <div v-if="s.agenda"><div class="ds-part-label">Ατζέντα</div><div class="markdown-body ds-md" v-html="md(s.agenda)" /></div>
        <div v-if="s.minutes"><div class="ds-part-label">Πρακτικά</div><div class="markdown-body ds-md" v-html="md(s.minutes)" /></div>
      </div>
    </section>

    <!-- ── Αξιολόγηση ── -->
    <section v-if="mode === 'full' && d.review && d.review.questions.some((q) => q.count)" class="ds-section">
      <h2 :style="{ color: accent }">Αξιολόγηση <small>({{ d.review.respondents }} απάντησαν)</small></h2>
      <div v-for="q in d.review.questions" :key="q.questionId" class="ds-review">
        <div v-if="q.average !== null"><b>{{ q.average }}/5</b> ({{ q.count }})</div>
        <ul v-if="q.texts.length"><li v-for="(t, i) in q.texts" :key="i">«{{ t.text }}» <small>— {{ t.user }}</small></li></ul>
      </div>
    </section>

    <footer class="ds-foot">
      Trifylli · {{ d.drasi.topiko }} · εκτυπώθηκε {{ formatDateTime(new Date().toISOString()) }}
      <span v-if="mode === 'full'"> · έντυπα: {{ d.formsPending.total - d.formsPending.pending }}/{{ d.formsPending.total }} συμπληρωμένα</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  DRASI_ARXIGEIO_KINDS,
  DRASI_FEE_KIND_LABEL,
  DRASI_GROUP_KIND_LABEL,
  DRASI_ROLE_LABEL,
  DRASI_SCHEDULE_KIND_LABEL,
  DRASI_TYPE_LABEL,
  DRASI_YPIRESIA_KINDS,
  KLADOS_LABEL,
  KLADOS_META,
  TREASURY_CATEGORY_LABEL,
  type DrasiDossier,
  type DrasiRoleKind,
} from '@trifylli/shared';
import { renderMarkdown } from '../../lib/markdown';
import { formatDate, formatDateRange, formatDateTime, formatEuro, formatTime } from '../../lib/format';

export type DossierMode = 'full' | 'participants' | 'skines';
const props = defineProps<{ dossier: DrasiDossier; mode: DossierMode }>();
const d = computed(() => props.dossier);
const accent = computed(() => (d.value.drasi.organiser ? KLADOS_META[d.value.drasi.organiser].color : '#546e7a'));

const md = (source: string): string => renderMarkdown(source, () => null);

const roleGroups = computed(() =>
  [...DRASI_ARXIGEIO_KINDS, ...DRASI_YPIRESIA_KINDS]
    .map((kind: DrasiRoleKind) => ({ kind, names: d.value.drasi.roles.filter((r) => r.kind === kind).map((r) => `${r.user.lastName} ${r.user.firstName}`) }))
    .filter((g) => g.names.length > 0),
);
const skines = computed(() => d.value.groups.filter((g) => g.kind === 'SKINI'));
const groupsNoSkini = computed(() => d.value.groups.filter((g) => g.kind !== 'SKINI'));
const unassignedSkini = computed(() => {
  const placed = new Set(skines.value.flatMap((g) => g.members.map((m) => m.participantId)));
  return d.value.participants.filter((p) => !placed.has(p.id));
});
</script>

<style>
/* Μη scoped: το φύλλο κλωνοποιείται σε iframe και χρειάζεται τους κανόνες από το @media print. */
@media print {
  .dossier { font-size: 11px; color: #111; line-height: 1.35; }
  .dossier .ds-rule { height: 4px; background: currentColor; margin-bottom: 8px; }
  .dossier .ds-eyebrow { display: flex; justify-content: space-between; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #555; }
  .dossier .ds-title { font-size: 22px; margin: 4px 0 2px; }
  .dossier .ds-sub { font-size: 11px; color: #444; }
  .dossier .ds-section { margin-top: 14px; }
  .dossier .ds-break { break-before: page; }
  .dossier h2 { font-size: 14px; margin: 0 0 6px; padding-bottom: 2px; border-bottom: 1px solid currentColor; }
  .dossier h2 small, .dossier h3 small { font-weight: normal; color: #666; font-size: 10px; }
  .dossier h3 { font-size: 12px; margin: 10px 0 4px; }
  .dossier .ds-goal { font-style: italic; color: #444; margin: 0 0 4px; }
  .dossier .ds-part { margin: 4px 0 8px; break-inside: avoid; }
  .dossier .ds-part-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #666; margin: 4px 0 2px; }
  .dossier .ds-facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 12px; margin: 0; }
  .dossier .ds-fact dt { font-size: 9px; text-transform: uppercase; color: #666; }
  .dossier .ds-fact dd { margin: 0; }
  .dossier .ds-table { width: 100%; border-collapse: collapse; margin: 4px 0; }
  .dossier .ds-table th, .dossier .ds-table td { border: 1px solid #bbb; padding: 3px 5px; vertical-align: top; text-align: left; }
  .dossier .ds-table th { background: #eee; font-size: 10px; }
  .dossier .ds-table .r { text-align: right; }
  .dossier .ds-small { font-size: 10px; }
  .dossier .ds-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .dossier .ds-grid-3 { grid-template-columns: repeat(3, 1fr); }
  .dossier .ds-card { border: 1px solid #bbb; padding: 6px 8px; break-inside: avoid; }
  .dossier .ds-card-title { font-weight: 600; margin-bottom: 2px; }
  .dossier .ds-card ul { margin: 0; padding-left: 16px; }
  .dossier .ds-tag { font-size: 9px; border: 1px solid #999; border-radius: 3px; padding: 0 3px; margin-left: 4px; color: #555; }
  .dossier .ds-muted { color: #666; font-size: 10px; }
  .dossier .ds-md p { margin: 2px 0; }
  .dossier .ds-review { margin: 4px 0 8px; }
  .dossier .ds-foot { margin-top: 16px; font-size: 9px; color: #777; border-top: 1px solid #ccc; padding-top: 4px; }
}
</style>
