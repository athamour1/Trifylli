<template>
  <!--
    Τα χαρτιά για τους γονείς, όπως τα πρότυπα του ΣΕΟ: το γράμμα (λογότυπο πάνω
    αριστερά, κείμενο, υπογραφή) και η εξάρτυση (κεφαλίδα με λογότυπο, ενότητες
    σε δύο στήλες). Ζει κρυφό στη σελίδα και κλωνοποιείται στο iframe εκτύπωσης.
  -->
  <div class="print-sheet gonis" :class="`gonis--${mode}`">
    <template v-if="mode === 'gramma'">
      <img :src="logo" alt="Σώμα Ελληνικού Οδηγισμού" class="gonis-logo" />
      <!-- eslint-disable-next-line vue/no-v-html — καθαρισμένο από το renderMarkdown -->
      <div class="gonis-letter" v-html="html" />
    </template>

    <template v-else-if="exartysi">
      <header class="gonis-head">
        <img :src="logo" alt="Σώμα Ελληνικού Οδηγισμού" class="gonis-logo gonis-logo--small" />
        <h1 class="gonis-title">{{ exartysi.title }}</h1>
      </header>
      <div class="gonis-columns">
        <section v-for="section in exartysi.sections" :key="section.id" class="gonis-section">
          <h2 class="gonis-section__title">{{ section.title }}</h2>
          <ul v-if="section.items.length">
            <li v-for="item in section.items" :key="item.id">{{ item.label }}</li>
          </ul>
          <p v-if="section.note" class="gonis-section__note">{{ section.note }}</p>
        </section>
      </div>
      <p v-if="exartysi.footer" class="gonis-footer">{{ exartysi.footer }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { DrasiExartysiView } from '@trifylli/shared';

defineProps<{
  mode: 'gramma' | 'exartysi';
  /** Το λογότυπο ως data URL — το iframe εκτύπωσης δεν φορτώνει αρχεία της εφαρμογής. */
  logo: string;
  /** Το γράμμα, έτοιμο HTML από το Markdown. */
  html?: string;
  exartysi?: DrasiExartysiView | null;
}>();
</script>

<style>
/* Μη scoped: το φύλλο κλωνοποιείται σε iframe και χρειάζεται τους κανόνες από το @media print. */
@media print {
  .gonis { color: #111; font-size: 11.5pt; line-height: 1.45; }
  .gonis .gonis-logo { display: block; width: 34mm; height: auto; }
  .gonis .gonis-logo--small { width: 24mm; }

  .gonis--gramma .gonis-letter { margin: 6mm 8mm 0 18mm; }
  .gonis--gramma .gonis-letter p { margin: 0 0 3.2mm; text-align: left; }
  .gonis--gramma .gonis-letter h1,
  .gonis--gramma .gonis-letter h2,
  .gonis--gramma .gonis-letter h3 { font-size: 13pt; margin: 4mm 0 2mm; }
  .gonis--gramma .gonis-letter ul,
  .gonis--gramma .gonis-letter ol { margin: 0 0 3.2mm; padding-left: 6mm; }

  .gonis--exartysi { color: #002060; font-size: 10pt; line-height: 1.35; }
  .gonis--exartysi .gonis-head { display: flex; align-items: center; gap: 6mm; margin-bottom: 6mm; }
  .gonis--exartysi .gonis-title { flex: 1; text-align: center; font-size: 15pt; font-weight: 700; letter-spacing: 0.04em; margin: 0; }
  .gonis--exartysi .gonis-columns { column-count: 2; column-gap: 10mm; }
  .gonis--exartysi .gonis-section { break-inside: avoid; margin: 0 0 3.5mm; }
  .gonis--exartysi .gonis-section__title { font-size: 10pt; font-weight: 700; text-transform: uppercase; margin: 0 0 1mm; }
  .gonis--exartysi .gonis-section__title::before { content: '■'; font-size: 7pt; margin-right: 2.5mm; vertical-align: 1px; }
  .gonis--exartysi ul { margin: 0; padding-left: 9mm; list-style: '–  '; }
  .gonis--exartysi li { margin: 0.4mm 0; }
  .gonis--exartysi .gonis-section__note { margin: 1mm 0 0 6mm; font-style: italic; font-weight: 600; }
  .gonis--exartysi .gonis-footer { margin-top: 6mm; font-weight: 700; text-align: center; }
}
</style>
