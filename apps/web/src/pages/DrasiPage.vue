<template>
  <!--
    Η σελίδα της δράσης: αριστερά οι ενότητές της σαν δεύτερο συρτάρι δίπλα στο
    κύριο (σε μικρές οθόνες γίνεται οριζόντια λωρίδα), δεξιά η ενότητα. Η πρώτη,
    «Επισκόπηση», είναι το γρήγορο βλέμμα: ποιοι έρχονται, αρχηγείο, πλήθη.
    Η ενότητα ζει στη διαδρομή (/draseis/:id/:section) ώστε να ανοίγει με link.
  -->
  <q-page class="drasi-page">
    <PageState :loading="loading && !data" :error="error" :stale="stale" @retry="reload">
      <div v-if="data" class="row no-wrap drasi-body">
        <!-- ── Συρτάρι ενοτήτων ── -->
        <nav ref="navEl" class="drasi-nav gt-sm" :class="{ 'drasi-nav--ready': navReady }">
          <!-- Το highlight της ενεργής ενότητας: ένα χάπι που γλιστρά στη νέα θέση. -->
          <span class="drasi-nav__thumb" :style="navThumb" aria-hidden="true" />
          <q-list padding>
            <!-- Ο εξωτερικός δεν έχει μενού εφαρμογής: από εδώ γυρίζει στις δράσεις του. -->
            <template v-if="auth.isExternal">
              <q-item clickable dense :to="{ name: 'dashboard' }" class="text-klados">
                <q-item-section avatar><q-icon name="arrow_back" size="20px" /></q-item-section>
                <q-item-section>Οι δράσεις μου</q-item-section>
              </q-item>
              <q-separator spaced />
            </template>
            <!-- Σε ομάδες: η Επισκόπηση μόνη πάνω, Λειτουργία, Πρόγραμμα, οι Ρυθμίσεις μόνες κάτω. -->
            <template v-for="g in navGroups" :key="g.key">
              <q-separator v-if="g.key === 'bottom'" spaced />
              <q-item-label v-if="g.label" header class="q-pb-xs">{{ g.label }}</q-item-label>
              <q-item
                v-for="s in g.items"
                :key="s.name"
                clickable
                dense
                :active="section === s.name"
                active-class="drasi-nav__active"
                :to="{ name: 'drasi', params: { id, section: s.name } }"
                replace
              >
                <q-item-section avatar><q-icon :name="s.icon" size="20px" /></q-item-section>
                <q-item-section>{{ s.label }}</q-item-section>
                <q-item-section v-if="unseen.has(s.name)" side>
                  <span class="drasi-nav__dot" aria-label="Άλλαξε από την τελευταία σου επίσκεψη" />
                </q-item-section>
                <q-item-section v-if="s.badge" side><q-badge color="grey-4" text-color="grey-9" :label="s.badge" /></q-item-section>
              </q-item>
            </template>
          </q-list>
        </nav>

        <div class="col drasi-content q-pa-md">
          <div class="row items-start justify-between q-gutter-sm q-mb-sm">
            <div class="col">
              <div class="page-title">{{ data.title }}</div>
              <div class="text-caption text-grey-7">
                {{ DRASI_TYPE_LABEL[data.type] }} · {{ formatDateRange(data.dateStart, data.dateEnd) }}
                · έναρξη {{ formatTime(data.dateStart) }}
                <span v-if="data.location"> · {{ data.location }}</span>
                <q-badge v-if="data.status !== 'ENERGI'" :color="data.status === 'KLEISTI' ? 'grey-8' : 'orange-7'" :label="DRASI_STATUS_LABEL[data.status]" class="q-ml-xs" />
              </div>
            </div>
            <!-- Ποιος άλλος είναι τώρα στη δράση (σε οποιαδήποτε ενότητα). -->
            <CollabPresence :peers="roomPeers" class="q-mt-xs" />
            <q-btn
              v-if="canWrite && wizardRoute && data.status === 'PROSXEDIO'"
              flat
              color="klados"
              icon="tune"
              label="Συνέχεια στήσιμου"
              :to="wizardRoute"
            />
          </div>

          <!-- Σε μικρές οθόνες: ένα κουμπί με την τρέχουσα ενότητα, που ανοίγει από
               κάτω πλέγμα με όλες — μια λωρίδα tabs έδειχνε μόλις 2–3 από τις 14. -->
          <q-btn
            class="lt-md full-width q-mb-md section-picker"
            outline
            no-caps
            color="klados"
            align="between"
            @click="sectionSheet = true"
          >
            <div class="row items-center no-wrap q-gutter-sm">
              <q-icon :name="currentSection?.icon ?? 'menu'" />
              <span class="text-weight-medium">{{ currentSection?.label ?? 'Ενότητες' }}</span>
              <q-badge v-if="currentSection?.badge" color="klados" text-color="klados-on" :label="currentSection.badge" />
            </div>
            <q-icon name="expand_more" />
          </q-btn>
          <q-dialog v-model="sectionSheet" position="bottom">
            <q-card class="section-sheet">
              <q-card-section v-if="auth.isExternal" class="q-pb-none">
                <q-btn flat no-caps color="klados" icon="arrow_back" label="Οι δράσεις μου" :to="{ name: 'dashboard' }" @click="sectionSheet = false" />
              </q-card-section>
              <q-card-section class="text-subtitle2 q-pb-sm">Ενότητες</q-card-section>
              <template v-for="g in navGroups" :key="g.key">
                <q-card-section v-if="g.label" class="text-caption text-grey-7 q-py-xs">{{ g.label }}</q-card-section>
                <q-card-section class="q-pt-none section-sheet__grid">
                  <button
                    v-for="s in g.items"
                    :key="s.name"
                    type="button"
                    class="section-sheet__tile"
                    :class="{ 'section-sheet__tile--active': s.name === section }"
                    @click="goSection(s.name); sectionSheet = false"
                  >
                    <q-icon :name="s.icon" size="24px" />
                    <span>{{ s.label }}</span>
                    <q-badge v-if="s.badge" floating rounded color="klados" text-color="klados-on" :label="s.badge" />
                    <span v-else-if="unseen.has(s.name)" class="drasi-nav__dot section-sheet__dot" aria-label="Άλλαξε από την τελευταία σου επίσκεψη" />
                  </button>
                </q-card-section>
              </template>
            </q-card>
          </q-dialog>

          <!-- Ένα στοιχείο της δράσης (προγραμματικό, γεύμα, συμβούλιο) ανοίγει στη θέση
               της ενότητας του: το συρτάρι μένει, η ενότητα μένει τονισμένη. -->
          <DrasiProgrammatiko v-if="child === 'programmatiko'" :key="childKey" />
          <DrasiGevma v-else-if="child === 'gevma'" :key="childKey" />
          <SymvoulioView v-else-if="child === 'symvoulio'" :key="childKey" :symvoulio-id="childKey" :drasi-id="id" />
          <q-tab-panels v-else :model-value="section" animated transition-prev="slide-down" transition-next="slide-up">
            <!-- ── Επισκόπηση: το γρήγορο βλέμμα ── -->
            <q-tab-panel name="episkopisi" class="q-pa-none">
              <q-banner v-if="data.status === 'PROSXEDIO'" rounded class="bg-grey-2 q-mb-md">
                <template #avatar><q-icon name="edit_note" color="grey-7" /></template>
                Προσχέδιο: το στήσιμο δεν ολοκληρώθηκε. Δεν εμφανίζεται στο ημερολόγιο μέχρι να ολοκληρωθεί.
              </q-banner>

              <DrasiHeadcounts :drasi-id="id" :can-start="canEdit('rythmiseis')" :kinds="drasiHeadcountKinds(data)" />
              <DrasiAnnouncements :drasi-id="id" :can-post="canEdit('rythmiseis')" />

              <!-- Αριθμοί με μια ματιά -->
              <div class="row q-col-gutter-sm q-mb-md">
                <div v-for="n in numbers" :key="n.label" class="col-6 col-sm-3">
                  <q-card flat bordered class="q-pa-sm full-height">
                    <div class="text-caption text-grey-7">{{ n.label }}</div>
                    <div class="text-h6">{{ n.value }}</div>
                  </q-card>
                </div>
              </div>

              <BirthdaysBanner :birthdays="data.birthdays ?? []" title="Γενέθλια κατά τη δράση" />

              <!-- Ποιοι έρχονται: ανά Τοπικό — πρώτα το δικό μας, μετά τα φιλοξενούμενα· οι κλάδοι στο tooltip. -->
              <div class="text-subtitle2 q-mb-xs">Ποιοι έρχονται</div>
              <div class="row items-center q-gutter-xs q-mb-md">
        <q-chip v-if="data.kladoi.length" dense outline icon="location_city" :label="ourTopiko">
          <q-tooltip>
            {{ data.kladoi.map((k) => KLADOS_LABEL[k]).join(', ') }}
            <span v-if="auth.topiko?.name"> · {{ auth.topiko.name }}</span>
          </q-tooltip>
        </q-chip>
        <q-chip
          v-for="g in data.guestTopika"
          :key="g.id"
          dense
          outline
          icon="location_city"
          :label="g.topikoName"
        >
          <q-tooltip v-if="g.kladoi.length || g.contactName">
            <span v-if="g.kladoi.length">{{ g.kladoi.map((k) => KLADOS_LABEL[k]).join(', ') }}</span>
            <span v-if="g.contactName"> · {{ g.contactName }}</span>
            <span v-if="g.contactPhone"> {{ g.contactPhone }}</span>
          </q-tooltip>
        </q-chip>
        <span v-if="!data.kladoi.length && !data.guestTopika.length" class="text-caption text-grey-6">
          Δεν έχει δηλωθεί ποιοι έρχονται.
        </span>
              </div>

              <DrasiApprovals :drasi-id="id" />

              <!-- Τι άλλαξε: η ροή δραστηριότητας, με όσα έγιναν από την τελευταία σου επίσκεψη τονισμένα. -->
              <q-card v-if="feed.length" flat bordered class="q-mb-md">
                <q-card-section class="text-subtitle2 q-pb-xs">Τι άλλαξε</q-card-section>
                <q-list dense class="q-pb-sm">
                  <q-item v-for="event in feed.slice(0, 8)" :key="event.id" :class="{ 'text-weight-medium': isNew(event) }">
                    <q-item-section avatar>
                      <q-icon :name="isNew(event) ? 'fiber_new' : 'history'" size="18px" :color="isNew(event) ? 'klados' : 'grey-6'" />
                    </q-item-section>
                    <q-item-section>{{ activityPhrase(event) }}</q-item-section>
                    <q-item-section side class="text-caption">{{ formatDateTime(event.at) }}</q-item-section>
                  </q-item>
                </q-list>
              </q-card>

              <!-- Το αρχηγείο: ονόματα και τηλέφωνα — αυτό ψάχνει κανείς στις 7 το πρωί. -->
      <!-- Στο κινητό αρχηγείο και υπηρεσίες ανοίγουν με πάτημα: είναι μακριές λίστες
           που αλλιώς σπρώχνουν τα υπόλοιπα πολύ χαμηλά. -->
      <q-card v-if="arxigeio.length" flat bordered class="q-mb-md">
        <q-expansion-item :default-opened="$q.screen.gt.sm" header-class="text-subtitle2" :label="`Αρχηγείο · ${arxigeio.reduce((n, g) => n + g.roles.length, 0)}`">
        <q-card-section class="row q-col-gutter-sm q-pt-none">
          <div v-for="group in arxigeio" :key="group.kind" class="col-12 col-sm-6 col-md-4">
            <div class="text-caption text-grey-7">{{ DRASI_ROLE_LABEL[group.kind] }}</div>
            <div v-for="r in group.roles" :key="r.id">
              {{ r.user.lastName }} {{ r.user.firstName }}
              <a v-if="r.user.phone" :href="`tel:${r.user.phone}`" class="text-klados text-caption q-ml-xs">
                {{ r.user.phone }}
              </a>
            </div>
          </div>
        </q-card-section>
        </q-expansion-item>
      </q-card>

              <q-card v-if="data.ypiresies.length" flat bordered class="q-mb-md">
                <q-expansion-item :default-opened="$q.screen.gt.sm" header-class="text-subtitle2" :label="`Υπηρεσίες · ${data.ypiresies.length}`">
                <q-card-section class="row q-col-gutter-sm q-pt-none">
                  <div v-for="y in data.ypiresies" :key="y.id" class="col-12 col-sm-6 col-md-4">
                    <div class="text-caption text-grey-7">{{ y.name }}</div>
                    <div v-for="r in y.responsibles" :key="r.user.id">
                      {{ r.user.lastName }} {{ r.user.firstName }}
                      <a v-if="r.user.phone" :href="`tel:${r.user.phone}`" class="text-klados text-caption q-ml-xs">{{ r.user.phone }}</a>
                    </div>
                    <div v-if="!y.responsibles.length" class="text-caption text-grey-6">Χωρίς υπεύθυνο</div>
                  </div>
                </q-card-section>
                </q-expansion-item>
              </q-card>

              <!-- Το φύλλο που ζητά το Τοπικό πριν την αναχώρηση. -->
              <div class="text-subtitle2 q-mb-xs">Στοιχεία ανά κλάδο</div>
              <PageState :loading="statsLoading" :empty="!stats?.totals.total" class="q-mb-md">
            <q-markup-table v-if="stats" flat bordered class="tf-stack tf-stack--compact">
              <thead>
                <tr>
                  <th class="text-left">Κλάδος</th>
                  <th class="text-right">Στελέχη</th>
                  <th class="text-right">Κατασκηνωτές</th>
                  <th class="text-right">Σύνολο</th>
                  <th class="text-left">Δεσμευμένο υλικό</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="k in stats.perKlados" :key="k.kladosType">
                  <td class="text-left tf-stack__head">{{ KLADOS_LABEL[k.kladosType] }}</td>
                  <td class="text-right" data-label="Στελέχη">{{ k.stelexi }}</td>
                  <td class="text-right" data-label="Κατασκηνωτές">{{ k.kataskinotes }}</td>
                  <td class="text-right text-weight-bold" data-label="Σύνολο">{{ k.total }}</td>
                  <td class="text-left" data-label="Δεσμευμένο υλικό">
                    <span v-if="!k.ylikoCheckedOut.length" class="text-grey-6">—</span>
                    <q-chip
                      v-for="y in k.ylikoCheckedOut"
                      :key="y.ylikoId"
                      dense
                      size="sm"
                      outline
                    >
                      {{ y.name }} × {{ y.qty }}
                    </q-chip>
                  </td>
                </tr>
                <tr v-if="stats.others?.total">
                  <td class="text-left tf-stack__head">Φιλοξενούμενοι &amp; εξωτερικοί</td>
                  <td class="text-right" data-label="Στελέχη">{{ stats.others.stelexi }}</td>
                  <td class="text-right" data-label="Κατασκηνωτές">{{ stats.others.kataskinotes }}</td>
                  <td class="text-right text-weight-bold" data-label="Σύνολο">{{ stats.others.total }}</td>
                  <td class="tf-stack__hide" />
                </tr>
                <tr class="bg-grey-2">
                  <td class="text-left text-weight-bold tf-stack__head">ΣΥΝΟΛΟ</td>
                  <td class="text-right text-weight-bold" data-label="Στελέχη">{{ stats.totals.stelexi }}</td>
                  <td class="text-right text-weight-bold" data-label="Κατασκηνωτές">{{ stats.totals.kataskinotes }}</td>
                  <td class="text-right text-weight-bold" data-label="Σύνολο">{{ stats.totals.total }}</td>
                  <td class="tf-stack__hide" />
                </tr>
              </tbody>
            </q-markup-table>
              </PageState>

              <template v-if="data.incidents.length">
                <div class="text-subtitle2 q-mb-xs">Περιστατικά</div>
          <q-list bordered separator class="rounded-borders">
            <q-item v-for="i in data.incidents" :key="i.id">
              <q-item-section avatar><q-icon name="healing" color="red-7" /></q-item-section>
              <q-item-section>
                <q-item-label>{{ i.summary }}</q-item-label>
                <q-item-label caption>{{ formatDateTime(i.occurredAt) }}</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
              </template>
            </q-tab-panel>

            <q-tab-panel name="programmatika" class="q-pa-none">
              <DrasiProgrammatika :drasi-id="id" :can-write="canEdit('programma')" />
            </q-tab-panel>

            <q-tab-panel name="programma" class="q-pa-none">
              <DrasiProgramma :drasi-id="id" :organiser="data.klados?.type ?? null" :can-write="canEdit('programma')" />
            </q-tab-panel>

            <q-tab-panel name="participants" class="q-pa-none">
              <DrasiSymmetexontes
                :drasi-id="id"
                :kladoi="data.kladoi"
                :guest-topika="data.guestTopika"
                :can-write="canEdit('participants')"
                :can-pay="canEdit('payments')"
                :can-handover="canEdit('handover')"
                :can-settings="canEdit('rythmiseis')"
                :locked="data.status === 'KLEISTI'"
                :costs="{
                  costPerPerson: data.costPerPerson,
                  costReduced: data.costReduced,
                  costStelexos: data.costStelexos,
                  transportCost: data.transportCost,
                }"
                @changed="reload"
              />
            </q-tab-panel>

            <q-tab-panel name="diatrofologio" class="q-pa-none">
              <DrasiDiatrofologio :drasi-id="id" :access="data.access" />
            </q-tab-panel>

            <q-tab-panel name="trofodosia" class="q-pa-none">
              <DrasiTrofodosia :drasi-id="id" :can-add="canEdit('trofodosia')" :can-buy="canEdit('purchase')" />
            </q-tab-panel>

            <q-tab-panel name="mythos" class="q-pa-none">
              <DrasiMythos
                :drasi-id="id"
                :organiser="data.klados?.type ?? null"
                :access="data.access"
                :closed="data.status === 'KLEISTI'"
              />
            </q-tab-panel>

            <q-tab-panel name="omades" class="q-pa-none">
              <DrasiOmades
                mode="groups"
                :drasi-id="id"
                :kladoi="data.kladoi"
                :organiser="data.klados?.type ?? null"
                :can-write="canEdit('omades')"
              />
            </q-tab-panel>

            <q-tab-panel name="skines" class="q-pa-none">
              <DrasiOmades
                mode="skines"
                :drasi-id="id"
                :kladoi="data.kladoi"
                :organiser="data.klados?.type ?? null"
                :can-write="canEdit('omades')"
              />
            </q-tab-panel>

            <q-tab-panel name="ypiresies" class="q-pa-none">
              <DrasiYpiresies :drasi-id="id" :can-edit="canEdit('ypiresies')" @changed="reload" />
            </q-tab-panel>

            <q-tab-panel name="entypa" class="q-pa-none">
              <DrasiEntypa :drasi-id="id" :can-write="canEdit('entypa')" :can-health="drasiCanReadHealth(data.access)" />
            </q-tab-panel>

            <q-tab-panel name="farmakeio" class="q-pa-none">
              <DrasiFarmakeio :drasi-id="id" :can-write="canEdit('farmakeio')" />
            </q-tab-panel>

            <q-tab-panel name="yliko" class="q-pa-none">
              <DrasiYliko
                :drasi-id="id"
                :organiser="data.klados?.type ?? null"
                :kladoi="data.kladoi"
                :guest-topika="data.guestTopika"
                :date-start="data.dateStart"
                :date-end="data.dateEnd"
                :can-write="canEdit('yliko')"
              />
            </q-tab-panel>

            <q-tab-panel name="tamio" class="q-pa-none">
              <DrasiTamio
                :drasi-id="id"
                :organiser="data.klados?.type ?? null"
                :can-write="canEditOpen('tamio')"
                :locked="data.status === 'KLEISTI'"
              />
            </q-tab-panel>

            <q-tab-panel name="symvoulia" class="q-pa-none">
              <DrasiSymvoulia :drasi-id="id" :can-write="canEditOpen('symvoulia')" />
            </q-tab-panel>

            <q-tab-panel name="axiologisi" class="q-pa-none">
              <DrasiAxiologisi :drasi-id="id" :can-write="canEditOpen('axiologisi')" :drasi-title="data.title" />
            </q-tab-panel>

            <q-tab-panel name="ektyposi" class="q-pa-none">
              <DrasiEktyposi :drasi-id="id" :title="data.title" :has-skines="drasiHasSkines(data)" :can-health="drasiCanReadHealth(data.access)" />
            </q-tab-panel>

            <q-tab-panel name="arxigeio" class="q-pa-none">
              <DrasiArxigeio
                :drasi-id="id"
                :roles="data.roles"
                :drasi-stelexi="drasiStelexi"
                :organiser="data.klados?.type ?? null"
                :can-edit="canEdit('arxigeio')"
                @changed="reload"
              />
            </q-tab-panel>

            <q-tab-panel name="rythmiseis" class="q-pa-none">
              <DrasiRythmiseis :data="data" @changed="reload" />
            </q-tab-panel>

          </q-tab-panels>
        </div>
      </div>
    </PageState>
  </q-page>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  drasiCan,
  drasiCanReadHealth,
  type DrasiAccess,
  type DrasiPerm,
  DRASI_GROUP_KINDS_BY_KLADOS,
  drasiHeadcountKinds,
  DRASI_GROUP_KIND_PLURAL,
  drasiHasSkines,
  DRASI_ARXIGEIO_KINDS,
  DRASI_ROLE_LABEL,
  DRASI_STATUS_LABEL,
  DRASI_TYPE_LABEL,
  KLADOS_LABEL,
  collabDocument,
  type BirthdayView,
  type DrasiActivityEvent,
  type DrasiActivityView,
  type DrasiGuestTopikoView,
  type DrasiRoleKind,
  type DrasiRoleView,
  type DrasiStatus,
  type DrasiType,
  type KataskinosiStats,
  type KladosType,
  type MemberKind,
} from '@trifylli/shared';
import BirthdaysBanner from '../components/BirthdaysBanner.vue';
import CollabPresence from '../components/CollabPresence.vue';
import PageState from '../components/PageState.vue';
import DrasiAnnouncements from '../components/drasi/DrasiAnnouncements.vue';
import DrasiHeadcounts from '../components/drasi/DrasiHeadcounts.vue';
import DrasiApprovals from '../components/drasi/DrasiApprovals.vue';
import DrasiAxiologisi from '../components/drasi/DrasiAxiologisi.vue';
import DrasiArxigeio from '../components/drasi/DrasiArxigeio.vue';
import DrasiEktyposi from '../components/drasi/DrasiEktyposi.vue';
import DrasiEntypa from '../components/drasi/DrasiEntypa.vue';
import DrasiFarmakeio from '../components/drasi/DrasiFarmakeio.vue';
import DrasiDiatrofologio from '../components/drasi/DrasiDiatrofologio.vue';
import DrasiMythos from '../components/drasi/DrasiMythos.vue';
import DrasiOmades from '../components/drasi/DrasiOmades.vue';
import DrasiProgramma from '../components/drasi/DrasiProgramma.vue';
import DrasiProgrammatika from '../components/drasi/DrasiProgrammatika.vue';
import DrasiRythmiseis from '../components/drasi/DrasiRythmiseis.vue';
import DrasiSymvoulia from '../components/drasi/DrasiSymvoulia.vue';
import DrasiYpiresies from '../components/drasi/DrasiYpiresies.vue';
import DrasiYliko from '../components/drasi/DrasiYliko.vue';
import DrasiSymmetexontes from '../components/drasi/DrasiSymmetexontes.vue';
import DrasiTamio from '../components/drasi/DrasiTamio.vue';
import DrasiTrofodosia from '../components/drasi/DrasiTrofodosia.vue';
import { useAsyncData } from '../composables/useAsyncData';
import { useCollabDoc, useCollabMe } from '../composables/useCollabDoc';
import { provideLiveChanges, useLiveReload } from '../composables/useLiveChanges';
import { useSlidingThumb } from '../composables/useSlidingThumb';
import { useKladosThemeStore } from '../stores/klados-theme';
import { get, post } from '../lib/api';
import { activityPhrase, sectionOfTopic, unseenSections } from '../lib/activity';
import { CLIENT_ID } from '../lib/client-id';
import { formatDateRange, formatDateTime, formatTime } from '../lib/format';
import { useAuthStore } from '../stores/auth';

// Τα «παιδιά» της δράσης: φορτώνονται όταν ανοίξει ένα.
const DrasiProgrammatiko = defineAsyncComponent(() => import('../components/drasi/DrasiProgrammatiko.vue'));
const DrasiGevma = defineAsyncComponent(() => import('../components/drasi/DrasiGevma.vue'));
const SymvoulioView = defineAsyncComponent(() => import('../components/SymvoulioView.vue'));

const kladosTheme = useKladosThemeStore();

interface DrasiDetail {
  id: string;
  title: string;
  type: DrasiType;
  status: DrasiStatus;
  dateStart: string;
  dateEnd: string;
  location: string | null;
  klados: { type: KladosType } | null;
  description: string | null;
  kladoi: KladosType[];
  guestTopika: DrasiGuestTopikoView[];
  roles: DrasiRoleView[];
  ypiresies: { id: string; name: string; responsibles: { user: DrasiRoleView['user'] }[] }[];
  /** Τι μπορεί ο χρήστης σε αυτή τη δράση (βλ. shared `drasiAccess`). */
  access: DrasiAccess;
  /** Συμμετέχοντες με γενέθλια κατά τη δράση — κενό αν δεν βλέπεις τους συμμετέχοντες. */
  birthdays?: BirthdayView[];
  costPerPerson: string | number | null;
  costReduced: string | number | null;
  costStelexos: string | number | null;
  transportCost: string | number | null;
  hasSkines: boolean;
  participants: {
    id: string;
    kind: MemberKind;
    confirmed: boolean;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      memberships: { klados: { type: KladosType } }[];
    };
  }[];
  checkouts: { id: string }[];
  syggentrwseis: {
    id: string;
    title: string | null;
    date: string;
    klados: { type: KladosType };
    _count: { timeline: number };
  }[];
  incidents: { id: string; summary: string; occurredAt: string }[];
}

const route = useRoute();

const groupsLabel = computed(() => {
  const kinds = [...new Set((data.value?.kladoi ?? []).flatMap((k) => DRASI_GROUP_KINDS_BY_KLADOS[k]))];
  return kinds.length ? kinds.map((k) => DRASI_GROUP_KIND_PLURAL[k]).join(' / ') : 'Ομάδες';
});

/** Το χάπι του συρταριού ενοτήτων — βλ. useSlidingThumb. */
const navEl = ref<HTMLElement | null>(null);
const { thumbStyle: navThumb, ready: navReady } = useSlidingThumb(navEl, '.drasi-nav__active');
const auth = useAuthStore();
/** Το δικό μας Τοπικό, όπως λέγονται και τα φιλοξενούμενα: με τον τόπο του. */
const ourTopiko = computed(() => auth.topiko?.location || auth.topiko?.name || 'Τοπικό');
const id = String(route.params.id);
const router = useRouter();

/** Ανοιχτό στοιχείο της δράσης (βλ. `meta.drasiChild` στις διαδρομές) και ποιο. */
const child = computed(() => route.meta.drasiChild ?? null);
// Το συμβούλιο παίρνει το `childKey` και ως id του· το γεύμα ξαναστήνεται και ανά παράλληλο.
const childKey = computed(() =>
  route.params.itemId ? `${String(route.params.itemId)}:${String(route.params.variantId ?? '')}` : String(route.params.symvoulioId ?? ''),
);

/** Η ενότητα ζει στη διαδρομή (ή είναι εκείνη του ανοιχτού στοιχείου)· άγνωστη ή κενή ⇒ Επισκόπηση. */
const section = computed(() => {
  const s = child.value ? (route.meta.drasiSection ?? '') : typeof route.params.section === 'string' ? route.params.section : '';
  return sections.value.some((x) => x.name === s) ? s : 'episkopisi';
});
const sectionSheet = ref(false);
const currentSection = computed(() => sections.value.find((x) => x.name === section.value) ?? null);
function goSection(name: string): void {
  void router.replace({ name: 'drasi', params: { id, section: name } });
}

/** Ενότητες χωρίς δικό τους δικαίωμα: ακολουθούν άλλης. */
const SECTION_PERM: Record<string, DrasiPerm> = { skines: 'omades', programmatika: 'programma' };

/** Οι ομάδες του συρταριού: Επισκόπηση (μόνη πάνω), Λειτουργία, Πρόγραμμα, Ρυθμίσεις (μόνες κάτω). */
type SectionGroup = 'top' | 'leitourgia' | 'programma' | 'bottom';
const SECTION_GROUPS: readonly { key: SectionGroup; label: string | null }[] = [
  { key: 'top', label: null },
  { key: 'leitourgia', label: 'Λειτουργία' },
  { key: 'programma', label: 'Πρόγραμμα' },
  { key: 'bottom', label: null },
];

const sections = computed(() => {
  const list: { name: string; label: string; icon: string; badge: string; group: SectionGroup }[] = [
    { name: 'episkopisi', label: 'Επισκόπηση', icon: 'dashboard', badge: '', group: 'top' },
    // ── Λειτουργία: ό,τι κρατά τη δράση όρθια ──
    { name: 'diatrofologio', label: 'Διατροφολόγιο', icon: 'restaurant_menu', badge: '', group: 'leitourgia' },
    // Τι αγοράζει η τροφοδοσία κάθε ημέρα: τα υλικά των γευμάτων και τα επιπλέον.
    { name: 'trofodosia', label: 'Τροφοδοσία', icon: 'shopping_cart', badge: '', group: 'leitourgia' },
    { name: 'participants', label: 'Συμμετέχοντες', icon: 'groups', badge: String(data.value?.participants.length ?? ''), group: 'leitourgia' },
    // Οι σκηνές έχουν δική τους ενότητα — μόνο όπου η δράση έχει (όχι μονοήμερες, ρύθμιση ανοιχτή).
    ...(data.value && drasiHasSkines(data.value) ? [{ name: 'skines', label: 'Σκηνές', icon: 'night_shelter', badge: '', group: 'leitourgia' as const }] : []),
    { name: 'ypiresies', label: 'Υπηρεσίες', icon: 'cleaning_services', badge: '', group: 'leitourgia' },
    { name: 'entypa', label: 'Έντυπα', icon: 'assignment', badge: '', group: 'leitourgia' },
    { name: 'farmakeio', label: 'Φαρμακείο', icon: 'medical_services', badge: '', group: 'leitourgia' },
    { name: 'yliko', label: 'Υλικό', icon: 'inventory_2', badge: '', group: 'leitourgia' },
    { name: 'tamio', label: 'Ταμείο', icon: 'account_balance_wallet', badge: '', group: 'leitourgia' },
    { name: 'ektyposi', label: 'Εκτύπωση', icon: 'print', badge: '', group: 'leitourgia' },
    { name: 'arxigeio', label: 'Αρχηγείο', icon: 'shield', badge: '', group: 'leitourgia' },
    // ── Πρόγραμμα: τι κάνουμε και πότε ──
    // Τα προγραμματικά (kanban) και το ωρολόγιο είναι δύο όψεις του ίδιου προγράμματος.
    { name: 'programmatika', label: 'Προγραμματικά', icon: 'view_kanban', badge: '', group: 'programma' },
    { name: 'programma', label: 'Ωρολόγιο', icon: 'schedule', badge: '', group: 'programma' },
    { name: 'mythos', label: 'Μύθος', icon: 'auto_stories', badge: '', group: 'programma' },
    // Το όνομα της υποομάδας του κλάδου: Πεντάδες / Φωλιές / Ενωμοτίες — με πολλούς κλάδους, όλες.
    // Οι δράσεις του Τοπικού δεν έχουν τέτοιες ομάδες (μόνο σκηνές, αν έχουν).
    ...(data.value?.klados && data.value.kladoi.length
      ? [{ name: 'omades', label: groupsLabel.value, icon: 'diversity_3', badge: '', group: 'programma' as const }]
      : []),
    { name: 'symvoulia', label: 'Συμβούλια', icon: 'forum', badge: '', group: 'programma' },
    { name: 'axiologisi', label: 'Αξιολόγηση', icon: 'rate_review', badge: '', group: 'programma' },
    { name: 'rythmiseis', label: 'Ρυθμίσεις', icon: 'settings', badge: '', group: 'bottom' },
  ];
  // Μόνο οι ενότητες που επιτρέπει ο ρόλος του χρήστη στη δράση (σκηνές = ομάδες, προγραμματικά = πρόγραμμα).
  return list.filter((x) => drasiCan(data.value?.access, (SECTION_PERM[x.name] ?? x.name) as DrasiPerm));
});
const navGroups = computed(() =>
  SECTION_GROUPS.map((g) => ({ ...g, items: sections.value.filter((s) => s.group === g.key) })).filter((g) => g.items.length),
);

/** Οι αριθμοί της επισκόπησης. */
const numbers = computed(() => {
  const d = data.value;
  if (!d) return [];
  const days = Math.max(1, Math.round((new Date(d.dateEnd).setHours(12) - new Date(d.dateStart).setHours(12)) / 86_400_000) + 1);
  return [
    { label: 'Συμμετέχοντες', value: d.participants.length },
    { label: 'Στελέχη', value: stats.value?.totals.stelexi ?? d.participants.filter((p) => p.kind === 'STELEXOS').length },
    { label: 'Παιδιά', value: stats.value?.totals.kataskinotes ?? d.participants.filter((p) => p.kind !== 'STELEXOS').length },
    { label: d.type === 'MONOIMERI' ? 'Ημέρα' : 'Ημέρες', value: days },
  ];
});

const { data, loading, error, stale, reload } = useAsyncData(
  () => get<DrasiDetail>(`/draseis/${id}`),
  { forbiddenPage: true, cacheKey: `drasi:${id}` },
);

// ── Τι άλλαξε: η ροή δραστηριότητας και τα σημαδάκια στις ενότητες ──
const feed = ref<DrasiActivityEvent[]>([]);
/** Πότε είδε τελευταία φορά τη δράση ο χρήστης (πριν από αυτή την επίσκεψη). */
const lastSeenAt = ref<string | null>(null);
/** Ενότητες όπου άλλαξε κάτι κάποιος άλλος — από την τελευταία επίσκεψη ή όσο είσαι εδώ. */
const unseen = ref(new Set<string>());
const isNew = (event: DrasiActivityEvent): boolean =>
  !!lastSeenAt.value && event.actor?.id !== auth.user?.id && new Date(event.at) > new Date(lastSeenAt.value);

async function loadFeed(first = false): Promise<void> {
  try {
    const view = await get<DrasiActivityView>(`/draseis/${id}/activity`);
    feed.value = view.events;
    if (first) {
      lastSeenAt.value = view.lastSeenAt;
      unseen.value = unseenSections(view.events, view.lastSeenAt, auth.user?.id);
      unseen.value.delete(section.value);
      // Η επόμενη επίσκεψη μετρά από τώρα.
      void post(`/draseis/${id}/activity/seen`, {}).catch(() => undefined);
    }
  } catch {
    // Χωρίς ροή η δράση δουλεύει όπως πριν.
  }
}
void loadFeed(true);
// Η ενότητα που ανοίγεις δεν έχει πια «καινούργιο».
watch(section, (name) => {
  if (!unseen.value.has(name)) return;
  const next = new Set(unseen.value);
  next.delete(name);
  unseen.value = next;
});

// ── Το δωμάτιο της δράσης: ποιος είναι εδώ, και «άλλαξε αυτό» για κάθε ενότητα ──
const room = useCollabDoc(collabDocument.drasiRoom(id), useCollabMe(), { persist: false });
const roomPeers = room.peers;
provideLiveChanges({ subscribe: room.onChange, setFocus: room.setFocus, peerFocus: room.peerFocus });
// Η ίδια η δράση: κεφαλίδα, επισκόπηση, αρχηγείο, ρυθμίσεις.
useLiveReload(['drasi', 'delete', 'roles', 'kladoi', 'guest-topika', 'closed', 'settings', 'slots', 'rotate', 'participants', 'guests', 'ypiresies'], reload, {
  subscribe: room.onChange,
});
// Ό,τι αλλάζουν οι άλλοι όσο είσαι εδώ: σημαδάκι στην ενότητα (αν δεν είσαι σε αυτήν) και νέα ροή.
let feedTimer: ReturnType<typeof setTimeout> | null = null;
room.onChange((change) => {
  if (change.origin === CLIENT_ID || change.by === auth.user?.id || change.quiet) return;
  const changed = sectionOfTopic(change.topic);
  if (changed && changed !== section.value) unseen.value = new Set([...unseen.value, changed]);
  if (feedTimer) clearTimeout(feedTimer);
  feedTimer = setTimeout(() => void loadFeed(), 1500);
});
onBeforeUnmount(() => {
  if (feedTimer) clearTimeout(feedTimer);
});

// Η σελίδα ζει εκτός `/k/:klados`, οπότε το layout δεν ξέρει τον κλάδο της· τον
// δηλώνει μόνη της ώστε τα κουμπιά της να πάρουν το χρώμα του.
watch(
  () => (data.value ? (data.value.klados?.type ?? null) : undefined),
  (klados) => kladosTheme.declare(klados),
  { immediate: true },
);

/** Πλήρης πρόσβαση (διαχείριση) — π.χ. συνέχεια του wizard. */
const canWrite = computed(() => !!data.value?.access.full);
/**
 * Επεξεργασία μιας ενότητας: ό,τι επιτρέπει ο ρόλος στη δράση (shared
 * `drasiAccess`, ο ίδιος κανόνας με το API) — και η δράση να μην είναι κλειστή.
 */
function canEdit(perm: DrasiPerm): boolean {
  return canEditOpen(perm) && data.value?.status !== 'KLEISTI';
}
/** Ίδιο, χωρίς τον έλεγχο «κλειστή» (ταμείο/κλείσιμο το χειρίζονται μόνα τους). */
function canEditOpen(perm: DrasiPerm): boolean {
  return drasiCan(data.value?.access, perm, 'edit');
}

/** Το wizard του διοργανωτή: κάτω από `/k/:klados/`, ή του Τοπικού για δράση Τοπικού. */
const wizardRoute = computed(() => {
  const klados = data.value?.klados?.type;
  return klados ? { name: 'klados-drasi-nea', params: { klados }, query: { id } } : { name: 'drasi-nea', query: { id } };
});

interface RoleGroup {
  kind: DrasiRoleKind;
  roles: DrasiRoleView[];
}

function groupRoles(kinds: readonly DrasiRoleKind[]): RoleGroup[] {
  const roles = data.value?.roles ?? [];
  return kinds
    .map((kind) => ({ kind, roles: roles.filter((r) => r.kind === kind) }))
    .filter((g) => g.roles.length > 0);
}

const arxigeio = computed(() => groupRoles(DRASI_ARXIGEIO_KINDS));
/** Τα στελέχη που συμμετέχουν — μόνο αυτά παίρνουν ρόλο στο αρχηγείο. */
const drasiStelexi = computed(() => (data.value?.participants ?? []).filter((p) => p.kind === 'STELEXOS').map((p) => p.user));

const stats = ref<KataskinosiStats | null>(null);
const statsLoading = ref(false);

watch(
  data,
  async (value) => {
    if (!value) return;
    statsLoading.value = true;
    try {
      stats.value = await get<KataskinosiStats>(`/draseis/${id}/stats`);
    } catch {
      stats.value = null;
    } finally {
      statsLoading.value = false;
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.section-picker :deep(.q-btn__content) {
  width: 100%;
}
.section-sheet {
  border-radius: 20px 20px 0 0 !important;
  padding-bottom: env(safe-area-inset-bottom);
}
.section-sheet__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.section-sheet__tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 4px;
  border: 1px solid var(--border-soft);
  border-radius: 14px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.8rem;
  text-align: center;
  cursor: pointer;
  transition: background-color var(--dur-medium) var(--ease-standard), transform var(--dur-short) var(--ease-standard);
}
.section-sheet__tile:active {
  transform: scale(0.96);
}
.section-sheet__tile--active {
  color: var(--klados-ink);
  font-weight: 600;
  border-color: var(--klados-ink);
  background: color-mix(in srgb, var(--klados-ink) 12%, transparent);
}
/* Το συρτάρι της δράσης πιάνει όλο το ύψος της κάρτας, σαν συνέχεια του κύριου συρταριού.
   Σε μεγάλες οθόνες η κάρτα της σελίδας έχει σταθερό ύψος και κυλά μέσα της (app.scss «Πλωτά πάνελ»)·
   εδώ πάμε ένα βήμα παραπέρα: κυλά ΜΟΝΟ η στήλη περιεχομένου, και το συρτάρι μένει ακίνητο — master/detail.
   Το συρτάρι υπάρχει μόνο από 1024px και πάνω (`gt-sm`), οπότε η διάταξη είναι μία. */
.drasi-nav {
  flex: 0 0 224px;
  width: 224px;
  border-right: 1px solid var(--line);
  background: var(--surface-2);
}
@media (min-width: 1024px) {
  .drasi-page {
    display: flex;
    flex-direction: column;
  }
  /* Το root του PageState (ανάμεσα στην q-page και το σώμα) πρέπει να περάσει το ύψος κάτω. */
  .drasi-page > :deep(div) {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .drasi-body {
    flex: 1 1 auto;
    min-height: 0;
  }
  .drasi-nav {
    min-height: 0;
    overflow-y: auto;
  }
  .drasi-content {
    min-height: 0;
    overflow-y: auto;
    scroll-behavior: smooth;
  }
}
.drasi-nav {
  position: relative;
}
/* «Άλλαξε από την τελευταία σου επίσκεψη»: μια τελεία στο χρώμα του κλάδου. */
.drasi-nav__dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--klados-ink, var(--q-primary));
}
.section-sheet__dot {
  position: absolute;
  top: 8px;
  right: 10px;
}
/* Το χρώμα του ενεργού στοιχείου το φέρνει το χάπι από κάτω, όχι το ίδιο. */
.drasi-nav__active {
  color: var(--klados-ink);
  font-weight: 600;
}
.drasi-nav :deep(.q-item) {
  position: relative;
  z-index: 1;
  border-radius: 10px;
  margin: 0 6px;
  padding-inline: 10px;
}
.drasi-nav :deep(.q-item__section--avatar) {
  min-width: 40px;
}
.drasi-nav__thumb {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 0;
  border-radius: 10px;
  background: color-mix(in srgb, var(--klados-ink) 12%, transparent);
  pointer-events: none;
  will-change: transform, height;
}
.drasi-nav--ready .drasi-nav__thumb {
  transition:
    transform 280ms var(--ease-emphasized),
    height 280ms var(--ease-emphasized),
    width 280ms var(--ease-emphasized),
    opacity var(--dur-medium) var(--ease-standard);
}
.drasi-content {
  min-width: 0;
}
</style>
