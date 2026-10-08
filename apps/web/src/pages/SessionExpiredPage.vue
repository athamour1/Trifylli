<template>
  <!-- Εκτός layout, όπως η 404: δεν υπάρχει συνεδρία για να δείξουμε μενού. -->
  <div class="se column no-wrap items-center justify-center q-pa-lg">
    <!-- Σκηνή: νύχτα στην κατασκήνωση, η φωτιά έχει σβήσει — μένουν κάρβουνα και καπνός. -->
    <svg class="se__scene" viewBox="0 0 520 300" role="img" aria-labelledby="se-title">
      <title id="se-title">Κατασκήνωση τη νύχτα, με σβησμένη φωτιά που καπνίζει</title>

      <!-- Αστέρια -->
      <g class="se__stars">
        <circle v-for="(s, i) in STARS" :key="i" :cx="s[0]" :cy="s[1]" :r="s[2]" :style="`--d: ${s[3]}s`" />
      </g>
      <!-- Φεγγάρι -->
      <g class="se__moon" transform="translate(430 56)">
        <circle r="22" />
        <circle class="se__moon-bite" cx="9" cy="-6" r="19" />
      </g>

      <!-- Λόφοι -->
      <path class="se__hill se__hill--far" d="M0 205 C 90 160, 170 190, 260 165 S 430 140, 520 180 V300 H0 Z" />
      <path class="se__hill se__hill--near" d="M0 245 C 100 215, 180 240, 270 222 S 440 200, 520 232 V300 H0 Z" />

      <!-- Σκηνή -->
      <g class="se__tent" transform="translate(120 190)">
        <path class="se__tent-side" d="M0 60 L55 -40 L110 60 Z" />
        <path class="se__tent-door" d="M55 -40 L30 60 L80 60 Z" />
        <path class="se__tent-pole" d="M55 -40 L55 -52" />
      </g>

      <!-- Καπνός -->
      <g class="se__smoke" transform="translate(330 186)">
        <circle class="se__puff" style="--d: 0s" r="7" />
        <circle class="se__puff" style="--d: 1.3s" r="6" />
        <circle class="se__puff" style="--d: 2.6s" r="8" />
      </g>

      <!-- Φωτιά: πέτρες, ξύλα, κάρβουνα -->
      <g class="se__fire" transform="translate(330 232)">
        <ellipse class="se__ash" rx="34" ry="9" />
        <g class="se__logs">
          <rect x="-26" y="-6" width="40" height="7" rx="3.5" transform="rotate(-14)" />
          <rect x="-16" y="-4" width="42" height="7" rx="3.5" transform="rotate(16)" />
        </g>
        <g class="se__embers">
          <circle cx="-8" cy="-2" r="3" style="--d: 0s" />
          <circle cx="4" cy="-5" r="2.5" style="--d: 0.7s" />
          <circle cx="11" cy="0" r="2" style="--d: 1.4s" />
          <circle cx="-2" cy="2" r="2" style="--d: 2.1s" />
        </g>
        <g class="se__stones">
          <circle v-for="(st, i) in STONES" :key="i" :cx="st[0]" :cy="st[1]" :r="st[2]" />
        </g>
      </g>
    </svg>

    <h1 class="se__title">Έσβησε η φωτιά.</h1>
    <p class="se__text">
      Η συνεδρία σου έληξε όσο έλειπες. Μια σύνδεση την ξανανάβει — και σε φέρνει πίσω εκεί που ήσουν.
    </p>
    <code v-if="returnTo !== '/'" class="se__path" :title="returnTo">{{ returnTo }}</code>

    <div class="row q-gutter-sm q-mt-lg justify-center">
      <q-btn unelevated color="primary" icon="local_fire_department" label="Σύνδεση ξανά" no-caps :loading="busy" @click="signIn" />
      <q-btn outline color="primary" icon="home" label="Αρχική" no-caps @click="goHome" />
    </div>
    <div v-if="error" class="se__error q-mt-md">{{ error }}</div>
    <div class="se__hint text-caption q-mt-md">Η φωτιά θέλει κάποιον να τη φυλάει.</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSessionStore } from '../stores/session';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const busy = ref(false);
const error = ref<string | null>(null);

/** Πού ήταν ο χρήστης όταν έληξε η συνεδρία — μόνο δικές μας διαδρομές. */
const returnTo = computed(() => {
  const raw = route.query.returnTo;
  const value = typeof raw === 'string' ? raw : '/';
  return value.startsWith('/') && !value.startsWith('//') ? value : '/';
});

/** Αστέρια: x, y, ακτίνα, καθυστέρηση τρεμοπαίγματος. */
const STARS: ReadonlyArray<readonly [number, number, number, number]> = [
  [40, 40, 1.6, 0], [90, 24, 1.2, 1.1], [150, 60, 1.8, 0.4], [210, 30, 1.3, 2.2], [260, 70, 1.5, 1.6],
  [310, 26, 1.2, 0.8], [360, 58, 1.7, 2.6], [480, 110, 1.3, 1.9], [70, 110, 1.1, 2.9], [500, 30, 1.4, 0.2],
  [20, 150, 1.2, 1.4], [240, 120, 1.1, 3.1], [400, 128, 1.4, 0.6],
];
const STONES: ReadonlyArray<readonly [number, number, number]> = [
  [-36, 4, 5], [-24, 9, 4.5], [-10, 11, 5], [6, 11, 4.5], [20, 9, 5], [34, 4, 4.5],
];

async function signIn(): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    session.expired = false;
    await session.signIn(returnTo.value);
  } catch (err) {
    busy.value = false;
    error.value = err instanceof Error ? err.message : 'Η σύνδεση δεν ξεκίνησε. Δοκίμασε ξανά.';
  }
}

function goHome(): void {
  session.expired = false;
  void router.push('/');
}

// Ήρθε εδώ ενώ έχει ήδη συνεδρία (π.χ. πίσω από το ιστορικό): δεν έχει νόημα
// να του λέμε ότι έσβησε η φωτιά.
onMounted(() => {
  if (session.authenticated) void router.replace(returnTo.value);
});
</script>

<style scoped lang="scss">
.se {
  // Νύχτα και στα δύο θέματα — η σκηνή είναι νυχτερινή — αλλά στο φωτεινό πιο
  // «σούρουπο», ώστε η σελίδα να μη φαίνεται ξένη δίπλα στην υπόλοιπη εφαρμογή.
  --se-sky-top: #1f3a5f;
  --se-sky-bottom: #e8eef3;
  --se-star: #ffffff;
  --se-moon: #fff3c4;
  --se-hill-far: #3f6e52;
  --se-hill-near: #2e5a40;
  --se-tent: #6d4c41;
  --se-tent-door: #4e342e;
  --se-stone: #78909c;
  --se-log: #4e342e;
  --se-ash: #90a4ae;
  --se-smoke: #cfd8dc;
  --se-text: #263238;
  --se-muted: #546e7a;
  --se-chip: rgba(0, 0, 0, 0.06);

  box-sizing: border-box;
  min-height: 100vh;
  min-height: 100dvh;
  overflow-x: hidden;
  text-align: center;
  color: var(--se-text);
  background: linear-gradient(180deg, var(--se-sky-top) 0%, var(--se-sky-top) 28%, var(--se-sky-bottom) 70%);
}

.se__scene {
  width: auto;
  max-width: 100%;
  height: clamp(150px, 36vh, 300px);
  margin-bottom: -8px;
}

.se__stars circle {
  fill: var(--se-star);
  animation: se-twinkle 3.2s ease-in-out infinite;
  animation-delay: var(--d);
}
.se__moon circle {
  fill: var(--se-moon);
}
.se__moon-bite {
  fill: var(--se-sky-top) !important;
}
.se__hill--far {
  fill: var(--se-hill-far);
}
.se__hill--near {
  fill: var(--se-hill-near);
}
.se__tent-side {
  fill: var(--se-tent);
}
.se__tent-door {
  fill: var(--se-tent-door);
}
.se__tent-pole {
  stroke: var(--se-tent-door);
  stroke-width: 2;
  stroke-linecap: round;
}
.se__ash {
  fill: var(--se-ash);
  opacity: 0.6;
}
.se__logs rect {
  fill: var(--se-log);
}
.se__stones circle {
  fill: var(--se-stone);
}
.se__embers circle {
  fill: #ff7043;
  animation: se-ember 2.8s ease-in-out infinite;
  animation-delay: var(--d);
}
.se__puff {
  fill: var(--se-smoke);
  opacity: 0;
  animation: se-smoke 3.9s ease-out infinite;
  animation-delay: var(--d);
}

.se__title {
  font-size: clamp(22px, 3.2vw, 30px);
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 10px 0 4px;
}
.se__text {
  max-width: 46ch;
  margin: 0 auto;
  color: var(--se-muted);
}
.se__path {
  display: inline-block;
  margin-top: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--se-chip);
  font-size: 12px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--se-muted);
}
.se__error {
  color: var(--q-negative);
  font-size: 0.9rem;
}
.se__hint {
  color: var(--se-muted);
  font-style: italic;
}

@keyframes se-twinkle {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
  }
}
@keyframes se-ember {
  0%,
  100% {
    opacity: 0.25;
  }
  50% {
    opacity: 1;
  }
}
@keyframes se-smoke {
  0% {
    opacity: 0;
    transform: translate(0, 0) scale(0.6);
  }
  15% {
    opacity: 0.55;
  }
  100% {
    opacity: 0;
    transform: translate(14px, -70px) scale(1.6);
  }
}

@media (prefers-reduced-motion: reduce) {
  .se *,
  .se *::before,
  .se *::after {
    animation: none !important;
  }
  .se__puff {
    opacity: 0.4;
    transform: translate(6px, -24px);
  }
}
</style>

<style lang="scss">
// Σκοτεινό θέμα: εκτός scoped (βλ. ErrorNotFound.vue για τον λόγο).
body.body--dark .se {
  --se-sky-top: #0b1220;
  --se-sky-bottom: #121512;
  --se-hill-far: #1d3322;
  --se-hill-near: #28462e;
  --se-stone: #546e7a;
  --se-ash: #78909c;
  --se-smoke: #90a4ae;
  --se-text: #e8ede8;
  --se-muted: #9fae9f;
  --se-chip: rgba(255, 255, 255, 0.08);
}
</style>
