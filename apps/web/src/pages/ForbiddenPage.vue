<template>
  <!-- Εκτός layout, όπως η 404 και η «Έσβησε η φωτιά»: μία καθαρή σκηνή. -->
  <div class="fb column no-wrap items-center justify-center q-pa-lg">
    <!-- Σκηνή: η πύλη της κατασκήνωσης, κλειδωμένη. Μέρα — δεν φταίει κανείς, απλώς δεν είναι δική σου. -->
    <svg class="fb__scene" viewBox="0 0 520 300" role="img" aria-labelledby="fb-title">
      <title id="fb-title">Κλειστή ξύλινη πύλη κατασκήνωσης με λουκέτο</title>

      <!-- Ήλιος και σύννεφα -->
      <circle class="fb__sun" cx="420" cy="62" r="24" />
      <g class="fb__cloud" style="--d: 0s">
        <ellipse cx="110" cy="58" rx="34" ry="12" />
        <ellipse cx="130" cy="50" rx="22" ry="12" />
      </g>
      <g class="fb__cloud fb__cloud--slow" style="--d: -6s">
        <ellipse cx="300" cy="40" rx="26" ry="9" />
        <ellipse cx="314" cy="34" rx="16" ry="9" />
      </g>

      <!-- Λόφοι και έλατα -->
      <path class="fb__hill fb__hill--far" d="M0 200 C 90 165, 170 190, 260 170 S 430 150, 520 185 V300 H0 Z" />
      <g class="fb__trees">
        <path d="M40 200 l16 -46 l16 46 Z" />
        <path d="M66 204 l12 -34 l12 34 Z" />
        <path d="M440 196 l16 -48 l16 48 Z" />
        <path d="M468 200 l12 -36 l12 36 Z" />
      </g>
      <path class="fb__hill fb__hill--near" d="M0 250 C 120 228, 200 246, 280 236 S 440 222, 520 242 V300 H0 Z" />

      <!-- Το μονοπάτι που σταματά στην πύλη -->
      <path class="fb__path" d="M232 300 C 240 276, 250 262, 256 248 L 284 248 C 290 262, 300 276, 308 300 Z" />

      <!-- Φράχτης δεξιά κι αριστερά -->
      <g class="fb__fence">
        <rect x="96" y="214" width="96" height="6" rx="3" />
        <rect x="96" y="230" width="96" height="6" rx="3" />
        <rect x="348" y="214" width="96" height="6" rx="3" />
        <rect x="348" y="230" width="96" height="6" rx="3" />
        <rect v-for="x in [102, 132, 162, 354, 384, 414]" :key="x" :x="x" y="204" width="8" height="44" rx="3" />
      </g>

      <!-- Στύλοι της πύλης, με σημαιάκι στον αριστερό -->
      <rect class="fb__post" x="186" y="150" width="14" height="100" rx="4" />
      <rect class="fb__post" x="340" y="150" width="14" height="100" rx="4" />
      <rect class="fb__beam" x="180" y="140" width="180" height="14" rx="5" />
      <line class="fb__pole" x1="193" y1="140" x2="193" y2="96" />
      <path class="fb__flag" d="M193 98 q14 -6 28 0 q-14 6 -28 12 Z" />

      <!-- Η πινακίδα -->
      <g class="fb__sign" transform="translate(270 128)">
        <rect x="-50" y="-16" width="100" height="24" rx="6" />
        <text x="0" y="1" text-anchor="middle">ΚΛΕΙΣΤΟ</text>
      </g>

      <!-- Τα φύλλα της πύλης -->
      <g class="fb__gate">
        <rect x="202" y="166" width="66" height="80" rx="4" />
        <rect x="272" y="166" width="66" height="80" rx="4" />
        <path class="fb__brace" d="M206 242 L264 170 M276 170 L334 242" />
      </g>

      <!-- Αλυσίδα και λουκέτο που ταλαντεύεται -->
      <g class="fb__lock">
        <path class="fb__chain" d="M262 200 q8 10 16 0" />
        <g class="fb__padlock">
          <path class="fb__shackle" d="M263 212 v-6 a7 7 0 0 1 14 0 v6" />
          <rect class="fb__body" x="259" y="211" width="22" height="18" rx="4" />
          <circle class="fb__keyhole" cx="270" cy="219" r="2.4" />
        </g>
      </g>
    </svg>

    <h1 class="fb__title">Εδώ δεν έχεις πρόσβαση.</h1>
    <p class="fb__text">
      Αυτή η σελίδα ανήκει σε άλλον κλάδο ή στο Τοπικό. Αν πιστεύεις ότι πρέπει να τη βλέπεις,
      μίλα με τον υπερδιαχειριστή του Τοπικού σου.
    </p>
    <code v-if="from" class="fb__path-chip" :title="from">{{ from }}</code>

    <div class="row q-gutter-sm q-mt-lg justify-center">
      <q-btn unelevated color="primary" icon="home" label="Στην Αρχική" no-caps @click="goHome" />
      <q-btn v-if="canGoBack" outline color="primary" icon="arrow_back" label="Πίσω" no-caps @click="goBack" />
    </div>
    <div class="fb__hint text-caption q-mt-md">Κάθε κατασκήνωση έχει τις πύλες της.</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

/** Πού προσπάθησε να μπει — μόνο δικές μας διαδρομές, όπως στη «Έσβησε η φωτιά». */
const from = computed(() => {
  const raw = route.query.from;
  const value = typeof raw === 'string' ? raw : '';
  return value.startsWith('/') && !value.startsWith('//') ? value : '';
});

// Το «Πίσω» έχει νόημα μόνο αν ήρθε από σελίδα της εφαρμογής· αλλιώς θα
// έφευγε από την εφαρμογή ή θα ξαναγύριζε στην κλειστή σελίδα.
const canGoBack = computed(() => typeof window !== 'undefined' && window.history.state?.back != null);

function goHome(): void {
  void router.push('/');
}
function goBack(): void {
  router.back();
}
</script>

<style scoped lang="scss">
.fb {
  --fb-sky-top: #bfe3f5;
  --fb-sky-bottom: #f6f8f4;
  --fb-sun: #ffd166;
  --fb-cloud: #ffffff;
  --fb-hill-far: #9cc9a5;
  --fb-hill-near: #6faa7b;
  --fb-tree: #3f7d52;
  --fb-path: #d9c3a0;
  --fb-wood: #8d6e63;
  --fb-wood-dark: #5d4037;
  --fb-sign: #efe3c8;
  --fb-sign-text: #5d4037;
  --fb-flag: #e53935;
  --fb-metal: #9e9e9e;
  --fb-lock: #f2b632;
  --fb-lock-dark: #8a6514;
  --fb-text: #263238;
  --fb-muted: #546e7a;
  --fb-chip: rgba(0, 0, 0, 0.06);

  box-sizing: border-box;
  min-height: 100vh;
  min-height: 100dvh;
  overflow-x: hidden;
  text-align: center;
  color: var(--fb-text);
  background: linear-gradient(180deg, var(--fb-sky-top) 0%, var(--fb-sky-bottom) 70%);
}

.fb__scene {
  width: auto;
  max-width: 100%;
  height: clamp(150px, 36vh, 300px);
  margin-bottom: -8px;
  // Η σκηνή σβήνει στις άκρες αντί να κόβεται σε ορθογώνιο πάνω στον ουρανό.
  mask-image:
    linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent),
    linear-gradient(180deg, #000 78%, transparent);
  mask-composite: intersect;
}

.fb__sun {
  fill: var(--fb-sun);
  animation: fb-glow 5s ease-in-out infinite;
}
.fb__cloud ellipse {
  fill: var(--fb-cloud);
  opacity: 0.9;
}
.fb__cloud {
  animation: fb-drift 22s linear infinite;
  animation-delay: var(--d);
}
.fb__cloud--slow {
  animation-duration: 34s;
}
.fb__hill--far {
  fill: var(--fb-hill-far);
}
.fb__hill--near {
  fill: var(--fb-hill-near);
}
.fb__trees path {
  fill: var(--fb-tree);
}
.fb__path {
  fill: var(--fb-path);
}
.fb__fence rect,
.fb__post,
.fb__beam {
  fill: var(--fb-wood);
}
.fb__beam {
  fill: var(--fb-wood-dark);
}
.fb__pole {
  stroke: var(--fb-wood-dark);
  stroke-width: 2.5;
  stroke-linecap: round;
}
.fb__flag {
  fill: var(--fb-flag);
  transform-origin: 193px 104px;
  animation: fb-wave 2.4s ease-in-out infinite;
}
.fb__sign rect {
  fill: var(--fb-sign);
  stroke: var(--fb-wood-dark);
  stroke-width: 2;
}
.fb__sign text {
  fill: var(--fb-sign-text);
  font: 700 12px/1 system-ui, sans-serif;
  letter-spacing: 0.14em;
}
.fb__gate rect {
  fill: var(--fb-wood);
  stroke: var(--fb-wood-dark);
  stroke-width: 2;
}
.fb__brace {
  stroke: var(--fb-wood-dark);
  stroke-width: 5;
  stroke-linecap: round;
  fill: none;
}
.fb__chain {
  stroke: var(--fb-metal);
  stroke-width: 3;
  fill: none;
  stroke-linecap: round;
}
// Το λουκέτο κρέμεται από την αλυσίδα και κουνιέται λίγο, σαν να το άγγιξε κάποιος.
.fb__padlock {
  transform-origin: 270px 204px;
  animation: fb-swing 3.2s ease-in-out infinite;
}
.fb__shackle {
  stroke: var(--fb-metal);
  stroke-width: 3.5;
  fill: none;
}
.fb__body {
  fill: var(--fb-lock);
  stroke: var(--fb-lock-dark);
  stroke-width: 1.5;
}
.fb__keyhole {
  fill: var(--fb-lock-dark);
}

.fb__title {
  font-size: clamp(22px, 3.2vw, 30px);
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 10px 0 4px;
}
.fb__text {
  max-width: 48ch;
  margin: 0 auto;
  color: var(--fb-muted);
}
.fb__path-chip {
  display: inline-block;
  margin-top: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--fb-chip);
  font-size: 12px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fb-muted);
}
.fb__hint {
  color: var(--fb-muted);
  font-style: italic;
}

@keyframes fb-swing {
  0%,
  100% {
    transform: rotate(-9deg);
  }
  50% {
    transform: rotate(9deg);
  }
}
@keyframes fb-wave {
  0%,
  100% {
    transform: skewY(0deg) scaleX(1);
  }
  50% {
    transform: skewY(-6deg) scaleX(0.92);
  }
}
@keyframes fb-drift {
  from {
    transform: translateX(-40px);
  }
  to {
    transform: translateX(40px);
  }
}
@keyframes fb-glow {
  0%,
  100% {
    opacity: 0.9;
  }
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .fb *,
  .fb *::before,
  .fb *::after {
    animation: none !important;
  }
}
</style>

<style lang="scss">
// Σκοτεινό θέμα: εκτός scoped (βλ. ErrorNotFound.vue για τον λόγο). Σούρουπο.
body.body--dark .fb {
  --fb-sky-top: #1b2a3a;
  --fb-sky-bottom: #141815;
  --fb-sun: #f4a261;
  --fb-cloud: #3a4a5a;
  --fb-hill-far: #24402b;
  --fb-hill-near: #2f5136;
  --fb-tree: #1a3322;
  --fb-path: #6b5a43;
  --fb-sign: #d9ccb0;
  --fb-text: #e8ede8;
  --fb-muted: #9fae9f;
  --fb-chip: rgba(255, 255, 255, 0.08);
}
</style>
