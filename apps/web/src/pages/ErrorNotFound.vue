<template>
  <!-- Η διαδρομή ζει εκτός layout, άρα όχι q-page (θέλει QLayout γονέα). -->
  <div class="nf column no-wrap items-center justify-center q-pa-lg">
    <!-- Σκηνή: μονοπάτι που χάνεται, σημάδια κλάδων, πυξίδα που δεν βρίσκει βορρά. -->
    <svg class="nf__scene" viewBox="0 0 520 300" role="img" aria-labelledby="nf-title">
      <title id="nf-title">Μονοπάτι που χάνεται στο βάθος, με μια πυξίδα που γυρίζει</title>

      <!-- Λόφοι -->
      <path class="nf__hill nf__hill--far" d="M0 215 C 90 165, 170 185, 260 160 S 430 135, 520 170 V300 H0 Z" />
      <path class="nf__hill nf__hill--near" d="M0 250 C 100 220, 180 245, 270 225 S 440 205, 520 235 V300 H0 Z" />

      <!-- Μονοπάτι: ζωγραφίζεται και σβήνει πριν φτάσει κάπου -->
      <path
        class="nf__trail"
        d="M-10 290 C 80 270, 120 240, 170 232 S 250 236, 290 214 S 340 176, 392 182 S 452 192, 488 176"
      />
      <!-- Ίχνη βημάτων -->
      <g class="nf__steps">
        <ellipse cx="70" cy="277" rx="4" ry="2.4" />
        <ellipse cx="96" cy="266" rx="4" ry="2.4" />
        <ellipse cx="124" cy="252" rx="4" ry="2.4" />
        <ellipse cx="152" cy="241" rx="4" ry="2.4" />
        <ellipse cx="182" cy="233" rx="4" ry="2.4" />
        <ellipse cx="212" cy="234" rx="4" ry="2.4" />
        <ellipse cx="242" cy="232" rx="4" ry="2.4" />
      </g>

      <!-- Σημάδια μονοπατιού στα χρώματα των κλάδων -->
      <g class="nf__markers">
        <g class="nf__marker" style="--i: 0; --c: #00a2b1" transform="translate(150 212)">
          <g class="nf__marker-body">
            <rect x="-2" y="0" width="4" height="30" rx="1" />
            <circle cx="0" cy="-4" r="7" />
          </g>
        </g>
        <g class="nf__marker" style="--i: 1; --c: #ffcb06" transform="translate(262 205)">
          <g class="nf__marker-body">
            <rect x="-2" y="0" width="4" height="30" rx="1" />
            <circle cx="0" cy="-4" r="7" />
          </g>
        </g>
        <g class="nf__marker" style="--i: 2; --c: #0094da" transform="translate(360 160)">
          <g class="nf__marker-body">
            <rect x="-2" y="0" width="4" height="30" rx="1" />
            <circle cx="0" cy="-4" r="7" />
          </g>
        </g>
        <g class="nf__marker nf__marker--fallen" style="--i: 3; --c: #ee1c25" transform="translate(452 190) rotate(68)">
          <g class="nf__marker-body">
            <rect x="-2" y="0" width="4" height="30" rx="1" />
            <circle cx="0" cy="-4" r="7" />
          </g>
        </g>
      </g>

      <!-- Πυξίδα -->
      <g class="nf__compass" transform="translate(260 96)">
        <circle class="nf__compass-ring" r="54" />
        <circle class="nf__compass-face" r="46" />
        <g class="nf__ticks">
          <line v-for="n in 12" :key="n" y1="-42" y2="-36" :transform="`rotate(${n * 30})`" />
        </g>
        <text class="nf__cardinal" y="-27" text-anchor="middle">Β</text>
        <text class="nf__cardinal" y="38" text-anchor="middle">Ν</text>
        <text class="nf__cardinal" x="-33" y="5" text-anchor="middle">Δ</text>
        <text class="nf__cardinal" x="33" y="5" text-anchor="middle">Α</text>
        <g class="nf__needle">
          <path class="nf__needle-n" d="M0 -36 L7 0 L-7 0 Z" />
          <path class="nf__needle-s" d="M0 36 L7 0 L-7 0 Z" />
        </g>
        <circle class="nf__pivot" r="4" />
      </g>

      <!-- Σύννεφα -->
      <g class="nf__cloud nf__cloud--a" style="--y: 70px" transform="translate(70 70)">
        <ellipse rx="26" ry="10" />
        <ellipse cx="18" cy="-6" rx="16" ry="11" />
      </g>
      <g class="nf__cloud nf__cloud--b" style="--y: 50px" transform="translate(430 50)">
        <ellipse rx="20" ry="8" />
        <ellipse cx="-14" cy="-5" rx="13" ry="9" />
      </g>
    </svg>

    <div class="nf__code" aria-hidden="true">4<span class="nf__zero">0</span>4</div>
    <h1 class="nf__title">Χάθηκες στο μονοπάτι.</h1>
    <p class="nf__text">
      Αυτή η διεύθυνση δεν οδηγεί πουθενά. Το σημάδι μάλλον έπεσε — ή κάποιος το μετακίνησε.
    </p>
    <code v-if="path" class="nf__path" :title="path">{{ path }}</code>

    <div class="row q-gutter-sm q-mt-lg justify-center">
      <q-btn unelevated color="primary" icon="home" label="Αρχική" :to="{ name: 'dashboard' }" no-caps />
      <q-btn outline color="primary" icon="arrow_back" label="Πίσω" no-caps @click="back" />
    </div>
    <div class="nf__hint text-caption q-mt-md">Οδηγός που χάνεται, βρίσκει νέο μονοπάτι.</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

/** Η διεύθυνση που ζητήθηκε, για να καταλάβει κανείς τι πήγε στραβά (κομμένη αν είναι τεράστια). */
const path = computed(() => {
  const p = route.fullPath;
  return p.length > 80 ? `${p.slice(0, 77)}…` : p;
});

function back(): void {
  if (window.history.length > 1) router.back();
  else void router.push({ name: 'dashboard' });
}
</script>

<style scoped lang="scss">
.nf {
  // Χρώματα της σκηνής: ανοιχτά στο φως, βαθιά στο σκοτάδι.
  --nf-sky: #eef6f0;
  --nf-hill-far: #c5e0c8;
  --nf-hill-near: #9fcaa5;
  --nf-trail: #8d6e63;
  --nf-step: #6d4c41;
  --nf-face: #fffdf7;
  --nf-ring: #6d4c41;
  --nf-tick: #a1887f;
  --nf-ink: #3e2723;
  --nf-cloud: #ffffff;
  --nf-text: #37474f;
  --nf-muted: #78909c;
  --nf-chip: rgba(46, 125, 50, 0.08);

  background: radial-gradient(ellipse at 50% 20%, #ffffff 0%, var(--nf-sky) 70%);
  color: var(--nf-text);
  text-align: center;
  box-sizing: border-box;
  min-height: 100vh;
  min-height: 100dvh;
  overflow-x: hidden;

}

.nf__scene {
  // Χωράει μαζί με το κείμενο και τα κουμπιά σε ένα ύψος οθόνης, χωρίς κύλιση.
  width: auto;
  max-width: 100%;
  height: clamp(150px, 36vh, 300px);
  margin-bottom: -8px;
}

.nf__hill {
  &--far {
    fill: var(--nf-hill-far);
  }
  &--near {
    fill: var(--nf-hill-near);
  }
}

// Το μονοπάτι ζωγραφίζεται από αριστερά και σβήνει προς το τέλος: οδηγεί κάπου που δεν υπάρχει.
.nf__trail {
  fill: none;
  stroke: var(--nf-trail);
  stroke-width: 5;
  stroke-linecap: round;
  stroke-dasharray: 10 9;
  animation: nf-walk 1.6s linear infinite;
  mask: linear-gradient(90deg, #000 55%, transparent 96%);
  -webkit-mask: linear-gradient(90deg, #000 55%, transparent 96%);
}

.nf__steps ellipse {
  fill: var(--nf-step);
  opacity: 0;
  animation: nf-step 3.2s ease-in-out infinite;
  @for $i from 1 through 7 {
    &:nth-child(#{$i}) {
      animation-delay: #{$i * 0.28}s;
    }
  }
}

.nf__marker {
  rect {
    fill: var(--nf-trail);
  }
  circle {
    fill: var(--c);
    stroke: var(--nf-face);
    stroke-width: 2;
  }
  &--fallen {
    opacity: 0.85;
  }
}

.nf__marker-body {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: nf-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  animation-delay: calc(0.4s + var(--i) * 0.18s);
}

.nf__compass {
  animation: nf-float 4s ease-in-out infinite;
}
.nf__compass-ring {
  fill: none;
  stroke: var(--nf-ring);
  stroke-width: 4;
}
.nf__compass-face {
  fill: var(--nf-face);
  stroke: var(--nf-tick);
  stroke-width: 1;
}
.nf__ticks line {
  stroke: var(--nf-tick);
  stroke-width: 2;
  stroke-linecap: round;
}
.nf__cardinal {
  font: 700 12px 'Inter', sans-serif;
  fill: var(--nf-ink);
}
.nf__needle {
  transform-origin: 0 0;
  animation: nf-seek 5s ease-in-out infinite;
}
.nf__needle-n {
  fill: #c62828;
}
.nf__needle-s {
  fill: var(--nf-tick);
}
.nf__pivot {
  fill: var(--nf-ink);
}

.nf__cloud {
  fill: var(--nf-cloud);
  opacity: 0.9;
  &--a {
    animation: nf-drift 18s linear infinite;
  }
  &--b {
    animation: nf-drift 24s linear infinite reverse;
  }
}

.nf__code {
  font-size: clamp(48px, min(12vw, 13vh), 96px);
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1;
  color: var(--q-primary);
  margin-top: 4px;
}
.nf__zero {
  display: inline-block;
  animation: nf-wobble 2.4s ease-in-out infinite;
  transform-origin: 50% 60%;
}

.nf__title {
  font-size: clamp(20px, 3vw, 28px);
  font-weight: 700;
  margin: 8px 0 4px;
  color: inherit;
}
.nf__text {
  max-width: 44ch;
  margin: 0 auto;
  color: var(--nf-muted);
}
.nf__path {
  display: inline-block;
  margin-top: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--nf-chip);
  font-size: 12px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--nf-muted);
}
.nf__hint {
  color: var(--nf-muted);
  font-style: italic;
}

@keyframes nf-walk {
  to {
    stroke-dashoffset: -19;
  }
}
@keyframes nf-step {
  0%,
  15% {
    opacity: 0;
  }
  25%,
  60% {
    opacity: 0.8;
  }
  80%,
  100% {
    opacity: 0;
  }
}
@keyframes nf-pop {
  from {
    opacity: 0;
    transform: translateY(14px) scale(0.6);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes nf-float {
  0%,
  100% {
    transform: translate(260px, 96px);
  }
  50% {
    transform: translate(260px, 90px);
  }
}
@keyframes nf-seek {
  0%,
  100% {
    transform: rotate(-30deg);
  }
  30% {
    transform: rotate(200deg);
  }
  55% {
    transform: rotate(130deg);
  }
  75% {
    transform: rotate(320deg);
  }
}
@keyframes nf-drift {
  from {
    transform: translate(-60px, var(--y, 60px));
  }
  to {
    transform: translate(580px, var(--y, 60px));
  }
}
@keyframes nf-wobble {
  0%,
  100% {
    transform: rotate(0);
  }
  25% {
    transform: rotate(-12deg);
  }
  75% {
    transform: rotate(12deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nf *,
  .nf *::before,
  .nf *::after {
    animation: none !important;
  }
  .nf__marker {
    opacity: 1;
  }
}
</style>

<style lang="scss">
// Σκοτεινό θέμα: εκτός scoped, γιατί το `:global(...) &` της Vue έβγαζε
// κανόνα σκέτο στο body και οι μεταβλητές του `.nf` τον υπερίσχυαν.
body.body--dark .nf {
  --nf-sky: #0f1a12;
  --nf-hill-far: #1d3322;
  --nf-hill-near: #28462e;
  --nf-trail: #8d6e63;
  --nf-step: #bcaaa4;
  --nf-face: #1f2a22;
  --nf-ring: #bcaaa4;
  --nf-tick: #8d6e63;
  --nf-ink: #efebe9;
  --nf-cloud: #2a3a2e;
  --nf-text: #e0e0e0;
  --nf-muted: #9e9e9e;
  --nf-chip: rgba(255, 255, 255, 0.08);
  background: radial-gradient(ellipse at 50% 20%, #182619 0%, var(--nf-sky) 70%);
}
</style>
