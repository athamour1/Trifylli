<template>
  <q-page padding class="settings">
    <div class="text-grey-7 q-mb-lg">Προτιμήσεις αυτής της συσκευής και τα στοιχεία του λογαριασμού σου.</div>

    <!-- ── Εμφάνιση ── -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="q-pb-sm">
        <div class="row items-center no-wrap q-gutter-sm">
          <q-icon name="palette" size="22px" class="text-klados" />
          <div class="section-title">Εμφάνιση</div>
        </div>
        <div class="text-caption text-grey-7 q-mt-xs">Διάλεξε πώς θα φαίνεται το Trifylli σε αυτή τη συσκευή.</div>
      </q-card-section>

      <q-card-section class="q-pt-none">
        <div class="theme-grid" role="radiogroup" aria-label="Θέμα εμφάνισης">
          <button
            v-for="opt in THEME_OPTIONS"
            :key="opt.value"
            type="button"
            role="radio"
            :aria-checked="themePref === opt.value"
            class="theme-option"
            :class="{ 'theme-option--active': themePref === opt.value }"
            @click="setThemePref(opt.value)"
          >
            <!-- Μικρογραφία της εφαρμογής: μπάρα, συρτάρι, δύο κάρτες. Στο «Αυτόματο»
                 μισή φωτεινή, μισή σκοτεινή. -->
            <div class="pv" aria-hidden="true">
              <div
                v-for="layer in layersOf(opt.value)"
                :key="layer"
                class="pv__layer"
                :class="[`pv__layer--${layer}`, { 'pv__layer--clip': opt.value === 'auto' && layer === 'dark' }]"
              >
                <div class="pv__bar"><i /><i class="pv__bar-title" /></div>
                <div class="pv__body">
                  <div class="pv__side"><i /><i /><i /><i /></div>
                  <div class="pv__main">
                    <div class="pv__card"><i class="pv__chip" /><i /><i /></div>
                    <div class="pv__card"><i class="pv__chip" /><i /></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="theme-option__label">
              <q-icon :name="opt.icon" size="18px" />
              <span>{{ opt.label }}</span>
            </div>
            <div class="theme-option__hint">{{ opt.hint }}</div>

            <transition name="q-transition--scale">
              <q-icon v-if="themePref === opt.value" name="check_circle" class="theme-option__check" size="22px" />
            </transition>
          </button>
        </div>

        <div class="row items-center no-wrap q-gutter-xs text-caption text-grey-7 q-mt-md">
          <q-icon :name="themePref === 'auto' ? (isDark ? 'dark_mode' : 'light_mode') : 'save'" size="16px" />
          <span>{{ statusLine }}</span>
        </div>
      </q-card-section>
    </q-card>

    <!-- ── Λογαριασμός ── -->
    <q-card flat bordered class="q-mb-md">
      <q-card-section class="q-pb-sm">
        <div class="row items-center no-wrap q-gutter-sm">
          <q-icon name="person" size="22px" class="text-klados" />
          <div class="section-title">Λογαριασμός</div>
        </div>
      </q-card-section>
      <q-card-section class="q-pt-none">
        <div class="row items-center no-wrap q-gutter-md">
          <q-avatar size="56px" color="klados" text-color="klados-on" class="text-weight-bold">
            {{ initials }}
          </q-avatar>
          <div class="col">
            <div class="text-subtitle1 text-weight-bold">{{ auth.displayName }}</div>
            <div class="text-caption text-grey-7">{{ auth.roleLabel }}<span v-if="auth.topiko"> · {{ auth.topiko.name }}</span></div>
          </div>
        </div>
      </q-card-section>
      <q-separator inset />
      <q-list>
        <q-item v-if="auth.profile?.user.email">
          <q-item-section avatar><q-icon name="mail" /></q-item-section>
          <q-item-section>
            <q-item-label caption>Email</q-item-label>
            <q-item-label>{{ auth.profile.user.email }}</q-item-label>
          </q-item-section>
        </q-item>
        <q-item v-if="auth.currentPeriod">
          <q-item-section avatar><q-icon name="event_repeat" /></q-item-section>
          <q-item-section>
            <q-item-label caption>Περίοδος</q-item-label>
            <q-item-label>{{ auth.currentPeriod.label }}</q-item-label>
          </q-item-section>
        </q-item>
        <q-item v-if="auth.kladoi.length">
          <q-item-section avatar><q-icon name="groups" /></q-item-section>
          <q-item-section>
            <q-item-label caption>Κλάδοι</q-item-label>
            <q-item-label>
              <div class="row q-gutter-xs q-mt-xs">
                <q-chip v-for="k in auth.kladoi" :key="k.type" dense :style="kladosVars(k.type)" class="bg-klados text-klados-on" :icon="k.icon">
                  {{ k.label }}
                </q-chip>
              </div>
            </q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
      <q-card-actions v-if="session.enabled" align="right" class="q-px-md q-pb-md">
        <q-btn flat color="negative" icon="logout" label="Αποσύνδεση" no-caps @click="confirmSignOut" />
      </q-card-actions>
    </q-card>

    <!-- ── Κωδικός ── -->
    <q-card v-if="passwordUrl" flat bordered class="q-mb-md">
      <q-card-section class="q-pb-sm">
        <div class="row items-center no-wrap q-gutter-sm">
          <q-icon name="key" size="22px" class="text-klados" />
          <div class="section-title">Κωδικός</div>
        </div>
        <div class="text-caption text-grey-7 q-mt-xs">
          Ο κωδικός φυλάσσεται στο Authentik, όχι στο Trifylli. Η αλλαγή γίνεται εκεί και σε επιστρέφει εδώ.
        </div>
      </q-card-section>
      <q-card-section class="q-pt-none">
        <div class="row q-gutter-sm">
          <q-btn unelevated color="klados" text-color="klados-on" icon="lock_reset" label="Αλλαγή κωδικού" no-caps :href="passwordUrl" />
          <q-btn
            flat
            color="klados"
            icon="mark_email_unread"
            label="Στείλε μου σύνδεσμο με email"
            no-caps
            :loading="sendingLink"
            @click="sendPasswordLink"
          />
        </div>
        <div class="text-caption text-grey-7 q-mt-sm">
          Το email είναι για όποιον δεν θυμάται τον τρέχοντα κωδικό: ο σύνδεσμος ισχύει 24 ώρες.
        </div>
      </q-card-section>
    </q-card>

    <!-- ── Συσκευή ── -->
    <q-card flat bordered>
      <q-card-section class="q-pb-sm">
        <div class="row items-center no-wrap q-gutter-sm">
          <q-icon name="devices" size="22px" class="text-klados" />
          <div class="section-title">Αυτή η συσκευή</div>
        </div>
      </q-card-section>
      <q-list>
        <q-item clickable v-ripple :to="{ name: 'sync' }">
          <q-item-section avatar>
            <q-icon :name="offline.online ? 'cloud_done' : 'cloud_off'" :color="offline.online ? 'positive' : 'grey-7'" />
          </q-item-section>
          <q-item-section>
            <q-item-label>Δεδομένα εκτός σύνδεσης</q-item-label>
            <q-item-label caption>
              {{ offline.online ? 'Συνδεδεμένο' : 'Χωρίς σύνδεση' }} · {{ offline.pending }} σε αναμονή
            </q-item-label>
          </q-item-section>
          <q-item-section side><q-icon name="chevron_right" /></q-item-section>
        </q-item>
      </q-list>
    </q-card>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { isDark, setThemePref, themePref, type ThemePref } from '../lib/theme';
import { kladosVars } from '../lib/klados-theme';
import { ApiError, post } from '../lib/api';
import { passwordChangeUrl } from '../lib/oidc';
import { useAuthStore } from '../stores/auth';
import { useOfflineStore } from '../stores/offline';
import { useSessionStore } from '../stores/session';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const offline = useOfflineStore();
const session = useSessionStore();

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePref; label: string; hint: string; icon: string }> = [
  { value: 'light', label: 'Φωτεινό', hint: 'Λευκό φόντο, για το φως της ημέρας.', icon: 'light_mode' },
  { value: 'dark', label: 'Σκοτεινό', hint: 'Ξεκουράζει τα μάτια το βράδυ και την μπαταρία.', icon: 'dark_mode' },
  { value: 'auto', label: 'Αυτόματο', hint: 'Ό,τι λέει η συσκευή, και αλλάζει μαζί της.', icon: 'brightness_auto' },
];

function layersOf(value: ThemePref): Array<'light' | 'dark'> {
  return value === 'auto' ? ['light', 'dark'] : [value];
}

const statusLine = computed(() =>
  themePref.value === 'auto'
    ? `Τώρα ${isDark.value ? 'σκοτεινό' : 'φωτεινό'}, γιατί έτσι είναι ρυθμισμένη η συσκευή.`
    : 'Η επιλογή αποθηκεύεται μόνο σε αυτή τη συσκευή.',
);

const initials = computed(() =>
  auth.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join(''),
);

// ── Κωδικός ──
/** Η ροή του Authentik γυρίζει εδώ με `?password=ok` μόνο αφού γραφτεί ο νέος κωδικός. */
const PASSWORD_DONE_FLAG = 'password';
const passwordUrl = passwordChangeUrl();

const sendingLink = ref(false);
async function sendPasswordLink(): Promise<void> {
  sendingLink.value = true;
  try {
    const { email } = await post<{ sent: true; email: string }>('/me/password-link');
    $q.notify({ type: 'positive', icon: 'mark_email_read', message: `Στάλθηκε σύνδεσμος στο ${email}.` });
  } catch (err) {
    $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : 'Δεν στάλθηκε το email. Δοκίμασε ξανά.' });
  } finally {
    sendingLink.value = false;
  }
}

onMounted(() => {
  if (route.query[PASSWORD_DONE_FLAG] !== 'ok') return;
  $q.notify({ type: 'positive', icon: 'lock', message: 'Ο κωδικός άλλαξε.' });
  // Καθαρίζουμε το σημάδι: ένα refresh δεν πρέπει να το ξαναπεί.
  void router.replace({ name: 'settings' });
});

/** Ίδιος κανόνας με το μενού της μπάρας: εκκρεμής ουρά → ρωτάμε πρώτα. */
function confirmSignOut(): void {
  if (offline.hasPending) {
    $q.dialog({
      title: 'Υπάρχουν ασυγχρόνιστα δεδομένα',
      message: `${offline.pending} καταχωρήσεις δεν έχουν σταλεί ακόμη. Αποσύνδεση;`,
      cancel: { label: 'Άκυρο', flat: true },
      ok: { label: 'Αποσύνδεση', color: 'negative' },
    }).onOk(() => void session.signOut());
    return;
  }
  void session.signOut();
}
</script>

<style scoped lang="scss">
.settings {
  max-width: 820px;
  margin: 0 auto;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 12px;
}

.theme-option {
  position: relative;
  display: block;
  width: 100%;
  padding: 12px;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
  background: var(--surface);
  border: 2px solid var(--border-soft);
  border-radius: var(--radius-card);
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;

  &:hover {
    box-shadow: var(--shadow-2);
    transform: translateY(-2px);
  }
  &:focus-visible {
    outline: 2px solid var(--klados-ink);
    outline-offset: 2px;
  }
  &--active {
    border-color: var(--klados-ink);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--klados-ink) 18%, transparent);
  }

  &__label {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    font-weight: 700;
  }
  &__hint {
    margin-top: 2px;
    font-size: 0.78rem;
    color: var(--muted);
  }
  &__check {
    position: absolute;
    top: 8px;
    right: 8px;
    color: var(--klados-ink);
    background: var(--surface);
    border-radius: 50%;
  }
}

// ── Μικρογραφία ──
.pv {
  position: relative;
  aspect-ratio: 16 / 10;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--line-soft);

  i {
    display: block;
    border-radius: 3px;
  }

  &__layer {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--pv-bg);

    &--light {
      --pv-bg: #f4f6f3;
      --pv-side: #fbfcfa;
      --pv-card: #ffffff;
      --pv-line: #d8ded8;
      --pv-text: #c3cbc3;
    }
    &--dark {
      --pv-bg: #121512;
      --pv-side: #161b17;
      --pv-card: #1b201c;
      --pv-line: #2d352e;
      --pv-text: #3f4a40;
    }
    &--clip {
      clip-path: polygon(58% 0, 100% 0, 100% 100%, 42% 100%);
    }
  }

  &__bar {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 16%;
    padding: 0 6px;
    background: var(--klados-color);
    i {
      width: 6px;
      height: 6px;
      background: rgba(255, 255, 255, 0.85);
    }
    &-title {
      width: 34% !important;
      height: 4px !important;
    }
  }
  &__body {
    flex: 1;
    display: flex;
  }
  &__side {
    width: 24%;
    padding: 6px 4px;
    background: var(--pv-side);
    border-right: 1px solid var(--pv-line);
    i {
      height: 4px;
      margin-bottom: 5px;
      background: var(--pv-text);
      &:first-child {
        background: var(--klados-color);
        opacity: 0.8;
      }
    }
  }
  &__main {
    flex: 1;
    padding: 6px;
    display: grid;
    gap: 5px;
  }
  &__card {
    padding: 5px;
    background: var(--pv-card);
    border: 1px solid var(--pv-line);
    border-radius: 5px;
    i {
      height: 3px;
      margin-top: 4px;
      background: var(--pv-text);
      width: 80%;
    }
  }
  &__chip {
    width: 30% !important;
    height: 5px !important;
    margin-top: 0 !important;
    background: var(--klados-color) !important;
    opacity: 0.85;
  }
}
</style>
