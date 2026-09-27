<template>
  <div class="print-sheet">
    <!-- Επιστολόχαρτο -->
    <header class="ps-head">
      <div class="ps-rule" :style="{ color: sheet.accent }" />
      <div class="ps-eyebrow">
        <span class="ps-org">{{ sheet.topiko }}</span>
        <span v-if="sheet.klados" class="ps-klados" :style="{ color: sheet.accent }">
          {{ sheet.klados }}
        </span>
      </div>
      <h1 class="ps-title">{{ sheet.title }}</h1>
      <div v-if="sheet.dateLabel" class="ps-date">{{ sheet.dateLabel }}</div>
    </header>

    <!-- Στοιχεία σε στήλες: διαβάζονται με μια ματιά, όχι σαν πρόταση -->
    <dl v-if="sheet.facts.length" class="ps-facts">
      <div v-for="fact in sheet.facts" :key="fact.label" class="ps-fact">
        <dt>{{ fact.label }}</dt>
        <dd>{{ fact.value }}</dd>
      </div>
    </dl>

    <section v-if="sheet.goal" class="ps-idea" :style="{ color: sheet.accent }">
      <div class="ps-idea-label">Κεντρική ιδέα</div>
      <div class="ps-idea-text">{{ sheet.goal }}</div>
    </section>

    <div v-if="sheet.stelexi.length" class="ps-crew">
      <span class="ps-crew-label">Στελέχη</span>
      <span>{{ sheet.stelexi.join(' · ') }}</span>
    </div>

    <!-- Πρόγραμμα -->
    <section v-for="part in sheet.parts" :key="part.section" class="ps-part">
      <h2 class="ps-part-head" :style="{ color: sheet.accent }">
        <span class="ps-part-bar" />
        <span class="ps-part-label">{{ part.label }}</span>
        <span class="ps-part-time">{{ part.range }}</span>
        <span class="ps-part-duration">{{ part.duration }}</span>
      </h2>

      <div v-if="part.notes" class="ps-part-notes markdown-body" v-html="render(part.notes)" />

      <div v-for="block in part.blocks" :key="block.key" class="ps-block">
        <div class="ps-block-clock">{{ block.start ?? '' }}</div>
        <div class="ps-block-body">
          <div class="ps-block-head">
            <span class="ps-block-title">{{ block.title || '—' }}</span>
            <span class="ps-block-duration">{{ block.duration }}</span>
          </div>
          <div v-if="block.responsible" class="ps-block-meta">
            Υπεύθυνος: {{ block.responsible }}
          </div>
          <div v-if="block.description" class="markdown-body" v-html="render(block.description)" />
          <div v-if="block.yliko" class="ps-block-meta">Υλικό: {{ block.yliko }}</div>
        </div>
      </div>
    </section>

    <!-- Υλικό: μία λίστα, ό,τι κι αν τη γέννησε -->
    <section v-if="sheet.yliko.length" class="ps-part">
      <h2 class="ps-part-head" :style="{ color: sheet.accent }">
        <span class="ps-part-bar" />
        <span class="ps-part-label">Υλικό</span>
        <span class="ps-part-duration">{{ sheet.yliko.length }}</span>
      </h2>

      <ul class="ps-checklist">
        <li v-for="(item, index) in sheet.yliko" :key="index">
          <span class="ps-box" :class="{ 'ps-box--checked': item.packed }" />
          {{ item.label }}<span v-if="item.qty > 1"> × {{ item.qty }}</span>
        </li>
      </ul>
    </section>

    <!-- Χώρος για σημειώσεις της ημέρας: το φύλλο ταξιδεύει στο ύπαιθρο. -->
    <section class="ps-part ps-notes">
      <h2 class="ps-part-head" :style="{ color: sheet.accent }">
        <span class="ps-part-bar" />
        <span class="ps-part-label">Σημειώσεις ημέρας</span>
      </h2>
      <div v-for="line in 4" :key="line" class="ps-noteline" />
    </section>

    <footer class="ps-foot">{{ sheet.footer }}</footer>
  </div>
</template>

<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue';
import { imageRefIds, renderMarkdown } from '../lib/markdown';
import { getBlob } from '../lib/api';
import type { PrintSheet } from '../lib/print-sheet';

/**
 * Το φύλλο που βγαίνει στον εκτυπωτή — και, μέσω «Αποθήκευση ως PDF», το PDF.
 *
 * Ξεχωριστό από τη φόρμα σχεδιασμού επίτηδες: ένα PDF της φόρμας θα ήταν
 * γεμάτο πλαίσια, κουμπιά και άδεια πεδία. Εδώ μένει μόνο το πρόγραμμα, σε
 * σειρά εκτέλεσης, όπως θα το κρατούσε κάποιος στο χέρι.
 *
 * Το περιεχόμενο έρχεται από την **τρέχουσα** κατάσταση της οθόνης, όχι από
 * τον server: τυπώνεις ό,τι βλέπεις, ακόμη κι αν η αποθήκευση δεν έχει προλάβει.
 */
const props = defineProps<{ sheet: PrintSheet }>();

// Οι εικόνες Markdown σερβίρονται με auth — για το χαρτί τις κάνουμε **data URL**
// (αυτοτελείς, τυπώνονται αξιόπιστα). Ο resolver δίνει το έτοιμο data URL.
const images = reactive<Record<string, string>>({});
// Εγγύηση επανασχεδίασης μετά τη φόρτωση των εικόνων — ανεξάρτητα από τη
// reactivity του δυναμικού map.
const renderTick = ref(0);
const render = (source: string): string => {
  void renderTick.value;
  return renderMarkdown(source, (id) => images[id] ?? null);
};

function markdownSources(): string[] {
  const out: string[] = [];
  for (const part of props.sheet.parts) {
    if (part.notes) out.push(part.notes);
    for (const block of part.blocks) if (block.description) out.push(block.description);
  }
  return out;
}

/** Κατεβάζει τις εικόνες ως data URLs στο `images` map. */
async function loadImages(): Promise<void> {
  const ids = new Set<string>();
  for (const source of markdownSources()) for (const id of imageRefIds(source)) ids.add(id);
  await Promise.all(
    [...ids].map(async (id) => {
      if (images[id]) return;
      try {
        images[id] = await blobToDataUrl(await getBlob(`/files/${id}`));
      } catch {
        /* αφήνουμε το placeholder — δεν μπλοκάρουμε την εκτύπωση */
      }
    }),
  );
  renderTick.value += 1;
}

// Προφόρτωση μόλις υπάρχει το φύλλο — ώστε η εικόνα να είναι έτοιμη για ΟΠΟΙΑΔΗΠΟΤΕ
// εκτύπωση (κουμπί ή Ctrl+P), όχι μόνο μέσω του `prepare()`.
watch(() => props.sheet, () => void loadImages(), { immediate: true });

/** Προφορτώνει τις εικόνες και περιμένει να αποκωδικοποιηθούν — πριν το `window.print()`. */
async function prepare(): Promise<void> {
  await loadImages();
  // Να προλάβει το DOM να δείξει τις εικόνες…
  await nextTick();
  // …και να τις **αποκωδικοποιήσει** ο browser: ένα `print()` πριν γίνει αυτό
  // πιάνει τις εικόνες κενές. Με ασφάλεια χρόνου ώστε να μην κολλήσει.
  const imgs = [...document.querySelectorAll<HTMLImageElement>('.print-sheet img')];
  await Promise.all(
    imgs.map((img) =>
      withTimeout(img.decode().catch(() => undefined), 3000),
    ),
  );
}

function withTimeout(promise: Promise<unknown>, ms: number): Promise<unknown> {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

defineExpose({ prepare });
</script>

<style lang="scss">
// Στην οθόνη δεν φαίνεται· ζει μόνο για τον εκτυπωτή. (Επιβεβαιωμένο με headless
// Chromium ότι οι εικόνες τυπώνονται κανονικά από `display:none`.)
.print-sheet {
  display: none;
}

@media print {
  html,
  body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }

  // Κρύβουμε τα πάντα με `visibility` και όχι με `display`, ώστε να μη χρειαστεί
  // να ξέρουμε τη δομή του layout της Quasar (header, drawer, page container).
  body * {
    visibility: hidden;
  }

  .print-sheet,
  .print-sheet * {
    visibility: visible;
  }

  // Το `position: static` είναι το κρίσιμο: όσο το layout ήταν θέσιμο, το φύλλο
  // αγκυρωνόταν **μέσα** του και κληρονομούσε το περιθώριο του συρταριού —
  // βγαίνοντας μετατοπισμένο και στριμωγμένο σε μια λωρίδα του χαρτιού.
  .q-layout,
  .q-page-container,
  .q-page,
  .q-drawer-container,
  .q-header,
  .q-footer {
    position: static !important;
    width: auto !important;
    min-height: 0 !important;
    padding: 0 !important;
    margin: 0 !important;
  }

  @page {
    size: A4;
    margin: 14mm 15mm;
  }

  .print-sheet {
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    z-index: auto;
    color: #000;
    font-size: 10.5pt;
    line-height: 1.45;
    // Χωρίς αυτό ο browser πετά τα χρώματα και η πινελιά του κλάδου χάνεται.
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  // ── Επιστολόχαρτο ──
  .ps-rule {
    height: 0;
    border-top: 2.5pt solid currentColor;
    margin-bottom: 5pt;
  }

  .ps-eyebrow {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 8pt;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .ps-org {
    font-weight: 600;
    color: #000;
  }

  .ps-klados {
    font-weight: 700;
  }

  .ps-title {
    margin: 3pt 0 0;
    font-weight: 700;
    font-size: 21pt;
    line-height: 1.12;
    letter-spacing: -0.01em;
  }

  .ps-date {
    margin-top: 1pt;
    font-size: 10.5pt;
  }

  // ── Στοιχεία ──
  .ps-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 0 20pt;
    margin: 9pt 0 0;
    padding: 6pt 0;
    border-top: 0.5pt solid #bbb;
    border-bottom: 0.5pt solid #bbb;

    dt {
      font-size: 7.5pt;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #555;
    }

    dd {
      margin: 0;
      font-size: 10.5pt;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
  }

  // ── Κεντρική ιδέα ──
  .ps-idea {
    margin-top: 9pt;
    padding: 5pt 0 5pt 8pt;
    border-left: 2.5pt solid currentColor;
    break-inside: avoid;
  }

  .ps-idea-label {
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .ps-idea-text {
    color: #000;
    font-size: 11.5pt;
  }

  .ps-crew {
    margin-top: 7pt;
    color: #000;
  }

  .ps-crew-label {
    margin-right: 6pt;
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #555;
  }

  // ── Πρόγραμμα ──
  .ps-part {
    margin-top: 13pt;
  }

  .ps-part-head {
    display: flex;
    align-items: baseline;
    gap: 7pt;
    margin: 0 0 5pt;
    padding-bottom: 3pt;
    border-bottom: 0.5pt solid #bbb;
    font-size: 12pt;
    line-height: 1.25;
    break-after: avoid;
  }

  .ps-part-bar {
    align-self: stretch;
    width: 3pt;
    background: currentColor;
  }

  .ps-part-label {
    flex: 1;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #000;
  }

  .ps-part-time,
  .ps-part-duration {
    font-size: 9pt;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
    color: #444;
  }

  .ps-part-duration {
    min-width: 32pt;
    text-align: right;
  }

  .ps-part-notes {
    margin-bottom: 5pt;
  }

  // Ένα κομμάτι δεν σπάει στη μέση: διαβάζεται σαν ενιαία οδηγία.
  .ps-block {
    display: flex;
    gap: 8pt;
    padding: 3pt 0;
    border-top: 0.5pt solid #e0e0e0;
    break-inside: avoid;

  }

  // Χωρίς σημειώσεις, το πρώτο κομμάτι ακουμπά στην επικεφαλίδα του μέρους και
  // οι δύο γραμμές τους έπεφταν η μία πάνω στην άλλη.
  .ps-part-head + .ps-block {
    border-top: 0;
  }

  .ps-block-clock {
    width: 34pt;
    flex: none;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .ps-block-body {
    flex: 1;
  }

  .ps-block-head {
    display: flex;
    align-items: baseline;
    gap: 8pt;
  }

  .ps-block-title {
    flex: 1;
    font-weight: 700;
  }

  .ps-block-duration {
    font-size: 9pt;
    font-variant-numeric: tabular-nums;
    color: #444;
  }

  .ps-block-meta {
    font-size: 9pt;
    color: #333;
  }

  // ── Υλικό ──
  .ps-checklist {
    margin: 0;
    padding: 0;
    list-style: none;
    column-count: 2;
    column-gap: 18pt;

    li {
      padding: 1.5pt 0;
      break-inside: avoid;
    }
  }

  // Σχεδιασμένο κουτάκι και όχι «☐/☑»: το δεύτερο το αποδίδουν οι
  // γραμματοσειρές ως έγχρωμο emoji, που σε ασπρόμαυρη εκτύπωση βγαίνει λεκές.
  .ps-box {
    display: inline-block;
    position: relative;
    width: 8.5pt;
    height: 8.5pt;
    margin-right: 5pt;
    border: 0.75pt solid #000;
    vertical-align: -0.5pt;
  }

  .ps-box--checked::after {
    content: '';
    position: absolute;
    inset: 1.5pt;
    background: #000;
  }

  // ── Σημειώσεις ──
  .ps-notes {
    break-inside: avoid;
  }

  .ps-noteline {
    height: 13pt;
    border-bottom: 0.5pt solid #ccc;
  }

  // ── Υποσέλιδο ──
  .ps-foot {
    margin-top: 12pt;
    padding-top: 4pt;
    border-top: 0.5pt solid #bbb;
    font-size: 8pt;
    color: #666;
  }

  // ── Markdown μέσα στο φύλλο ──
  .markdown-body {
    font-size: 10pt;

    // Σε χαρτί οι επικεφαλίδες του Markdown πρέπει να μένουν κάτω από τον
    // τίτλο του μέρους· τα μεγέθη της οθόνης τις έβγαζαν μεγαλύτερες.
    h1 {
      font-size: 11pt;
    }
    h2 {
      font-size: 10.5pt;
    }
    h3,
    h4 {
      font-size: 10pt;
    }

    blockquote {
      border-left-color: #999;
      color: #000;
    }

    code,
    pre {
      background: none;
      border: 0.5pt solid #bbb;
    }

    img {
      max-width: 100%;
      height: auto;
      break-inside: avoid;
    }

    // Εικόνα που δεν πρόλαβε να φορτώσει: ορατό σημάδι αντί για κενό.
    img.md-img-pending {
      min-width: 160px;
      min-height: 60px;
      border: 1pt dashed #c00;
      background: #fff3f3;
    }
  }
}
</style>
