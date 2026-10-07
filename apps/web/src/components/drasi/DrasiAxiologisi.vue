<template>
  <!--
    Η αξιολόγηση σαν φόρμα (όπως τα Google Forms): για όποιον διαχειρίζεται τη
    δράση τρεις καρτέλες — Ερωτήσεις · Απαντήσεις · Ρυθμίσεις — και προεπισκόπηση
    της φόρμας· για όλους τους άλλους, η φόρμα προς συμπλήρωση. Ό,τι αλλάζει ο
    διαχειριστής σώζεται μόνο του· αντί για σύνδεση με φύλλο, λήψη σε Excel.
  -->
  <div>
    <q-inner-loading :showing="loading && !view" />

    <template v-if="view">
      <div v-if="canWrite" class="row items-center no-wrap q-mb-md">
        <q-tabs v-model="tab" dense align="left" class="text-klados col" narrow-indicator>
          <q-tab name="questions" label="Ερωτήσεις" />
          <q-tab name="responses">
            <div class="row items-center no-wrap q-gutter-xs">
              <span>Απαντήσεις</span>
              <q-badge v-if="view.summary" color="klados" text-color="klados-on" :label="view.summary.respondents" />
            </div>
          </q-tab>
          <q-tab name="settings" label="Ρυθμίσεις" />
        </q-tabs>
        <SaveStatus v-if="saveStatus !== 'clean'" :status="saveStatus" class="q-mx-sm" @retry="saveNow" />
        <q-btn flat round dense :color="tab === 'fill' ? 'klados' : 'grey-7'" icon="visibility" @click="tab = 'fill'">
          <q-tooltip>Προεπισκόπηση — όπως τη βλέπει όποιος απαντά</q-tooltip>
        </q-btn>
        <q-btn color="klados" text-color="klados-on" unelevated dense icon="send" label="Αποστολή" class="q-ml-sm" :disable="!view.questions.length" @click="openSend">
          <q-tooltip>Σύνδεσμοι προς τους συμμετέχοντες — χωρίς λογαριασμό</q-tooltip>
        </q-btn>
      </div>

      <!-- ══════════ Αποστολή: δημόσιοι σύνδεσμοι ανά συμμετέχοντα ══════════ -->
      <q-dialog v-model="sendDialog">
        <q-card style="min-width: min(720px, 96vw); max-height: 90vh" class="column no-wrap">
          <q-card-section class="row items-center q-pb-sm">
            <div class="text-subtitle1 text-weight-medium">Αποστολή αξιολόγησης</div>
            <q-space />
            <q-btn flat round dense icon="close" v-close-popup />
          </q-card-section>
          <q-card-section class="text-caption text-grey-7 q-pt-none">
            Κάθε σύνδεσμος ανοίγει τη φόρμα για <b>έναν</b> συμμετέχοντα, χωρίς λογαριασμό, και μετρά ως η δική του απάντηση. Λήγει σε
            {{ FORM_LINK_TTL_DAYS }} ημέρες. Οι σύνδεσμοι φαίνονται <b>μόνο τη στιγμή της έκδοσης</b> — μετά μόνο νέος σύνδεσμος.
          </q-card-section>
          <!-- Κοινός σύνδεσμος: ένας για όλους — για ομάδα WhatsApp/ανακοίνωση -->
          <q-card-section class="q-pt-none">
            <q-card flat bordered class="q-pa-sm">
              <div class="row items-center q-gutter-sm">
                <q-icon name="public" color="klados" />
                <div class="col">
                  <div class="text-body2 text-weight-medium">Κοινός σύνδεσμος (ένας για όλους)</div>
                  <div class="text-caption text-grey-7">
                    <template v-if="share?.active">Ενεργός από {{ share.createdAt ? formatDate(share.createdAt) : '' }} · {{ share.guestResponses }} απαντήσεις μέσω αυτού. Όποιος τον έχει μπορεί να απαντήσει{{ settings.anonymous ? ' ανώνυμα' : ' δίνοντας το όνομά του' }}.</template>
                    <template v-else>Για ομάδα ή ανακοίνωση — δεν ξέρει ποιος απαντά{{ settings.anonymous ? '' : ', ζητά όνομα' }}· δεν περιορίζει σε μία απάντηση ανά άτομο.</template>
                  </div>
                </div>
                <q-btn v-if="!share?.active" color="klados" text-color="klados-on" unelevated dense icon="add_link" label="Δημιουργία" :loading="sharing" @click="createShare" />
                <template v-else>
                  <q-btn flat dense color="klados" icon="refresh" label="Νέος" :loading="sharing" @click="createShare"><q-tooltip>Νέος σύνδεσμος — ο προηγούμενος παύει να ισχύει</q-tooltip></q-btn>
                  <q-btn flat dense color="negative" icon="link_off" label="Απενεργοποίηση" :loading="sharing" @click="revokeShare" />
                </template>
              </div>
              <div v-if="shareUrl" class="row items-center no-wrap q-gutter-xs q-mt-sm bg-grey-2 rounded-borders q-pa-xs">
                <div class="col ellipsis text-caption q-pl-xs">{{ shareUrl }}</div>
                <q-btn flat dense round icon="content_copy" @click="copyText(shareUrl)"><q-tooltip>Αντιγραφή</q-tooltip></q-btn>
                <q-btn flat dense round icon="share" :href="whatsappShare(shareUrl)" target="_blank" rel="noopener"><q-tooltip>WhatsApp</q-tooltip></q-btn>
              </div>
              <div v-if="shareUrl" class="text-caption text-grey-7 q-mt-xs">Φαίνεται μόνο τώρα — αντίγραψέ τον. Αργότερα μπορείς μόνο να βγάλεις νέο.</div>
            </q-card>
          </q-card-section>

          <q-card-section class="q-pt-none text-subtitle2">Προσωπικοί σύνδεσμοι (ένας ανά συμμετέχοντα)</q-card-section>
          <q-card-section class="q-pt-none row q-gutter-sm">
            <q-btn color="klados" text-color="klados-on" unelevated icon="link" label="Έκδοση σε όσους δεν έχουν" :loading="issuing" @click="issueInvites({})" />
            <q-btn flat color="klados" icon="refresh" label="Νέοι σύνδεσμοι σε όσους εκκρεμούν" :loading="issuing" @click="issueInvites({ reissue: true })" />
            <q-space />
            <span v-if="invites.length" class="text-caption text-grey-7 self-center">{{ invites.filter((i) => i.status === 'SUBMITTED').length }} / {{ invites.length }} απάντησαν</span>
          </q-card-section>
          <q-card-section v-if="issued.length" class="q-pt-none">
            <q-banner rounded class="bg-grey-2">
              <div class="text-caption text-grey-7 q-mb-xs">Νέοι σύνδεσμοι ({{ issued.length }}) — αντίγραψέ τους τώρα:</div>
              <q-list dense separator>
                <q-item v-for="l in issued" :key="l.inviteId" class="q-px-none">
                  <q-item-section>
                    <q-item-label>{{ inviteName(l.participantId) }}</q-item-label>
                    <q-item-label caption class="ellipsis">{{ l.url }}</q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <div class="row no-wrap">
                      <q-btn flat dense round icon="content_copy" @click="copyText(l.url)"><q-tooltip>Αντιγραφή</q-tooltip></q-btn>
                      <q-btn flat dense round icon="share" :href="whatsapp(l)" target="_blank" rel="noopener"><q-tooltip>WhatsApp</q-tooltip></q-btn>
                    </div>
                  </q-item-section>
                </q-item>
              </q-list>
              <q-btn flat dense no-caps color="klados" label="Αντιγραφή όλων" class="q-mt-xs" @click="copyText(issued.map((l) => `${inviteName(l.participantId)}: ${l.url}`).join('\n'))" />
            </q-banner>
          </q-card-section>
          <q-card-section class="col scroll q-pt-none">
            <q-markup-table flat bordered dense>
              <thead>
                <tr><th class="text-left">Συμμετέχων</th><th class="text-left">Κατάσταση</th><th /></tr>
              </thead>
              <tbody>
                <tr v-for="i in invites" :key="i.participantId">
                  <td>{{ i.user.lastName }} {{ i.user.firstName }} <span class="text-caption text-grey-6">{{ i.user.kind === 'STELEXOS' ? '· στέλεχος' : '' }}</span></td>
                  <td>
                    <q-chip dense :color="inviteColor(i.status)" text-color="white" :label="i.status === 'SUBMITTED' ? 'Απάντησε' : DRASI_FORM_STATUS_LABEL[i.status]" />
                    <span v-if="i.answeredAt" class="text-caption text-grey-7">{{ formatDate(i.answeredAt) }}</span>
                    <span v-else-if="i.expiresAt" class="text-caption text-grey-7">έως {{ formatDate(i.expiresAt) }}</span>
                  </td>
                  <td class="text-right no-wrap">
                    <q-btn v-if="i.status === 'SENT' || i.status === 'OPENED' || (i.status === 'SUBMITTED' && settings.allowEdit)" flat dense round size="sm" icon="content_copy" color="klados" :loading="copying === i.participantId" @click="copyInvite(i)">
                      <q-tooltip>Αντιγραφή συνδέσμου — εκδίδεται νέος (ο προηγούμενος παύει να ισχύει)</q-tooltip>
                    </q-btn>
                    <q-btn v-if="i.inviteId && (i.status === 'SENT' || i.status === 'OPENED')" flat dense round size="sm" icon="link_off" color="negative" @click="voidInvite(i)"><q-tooltip>Ακύρωση συνδέσμου</q-tooltip></q-btn>
                    <q-btn v-if="i.status === 'PENDING' || i.status === 'VOID'" flat dense round size="sm" icon="link" color="klados" :loading="copying === i.participantId" @click="copyInvite(i)"><q-tooltip>Έκδοση & αντιγραφή συνδέσμου</q-tooltip></q-btn>
                  </td>
                </tr>
              </tbody>
            </q-markup-table>
          </q-card-section>
        </q-card>
      </q-dialog>

      <q-tab-panels v-model="tab" animated>
        <!-- ══════════ Ερωτήσεις ══════════ -->
        <q-tab-panel name="questions" class="q-pa-none">
          <q-card flat bordered class="form-head q-mb-md">
            <q-card-section>
              <q-input v-model="settings.title" borderless class="form-title" :placeholder="defaultTitle" maxlength="200" />
              <q-input v-model="settings.description" borderless dense autogrow placeholder="Περιγραφή της φόρμας" maxlength="2000" />
            </q-card-section>
          </q-card>

          <div
            v-for="(q, idx) in editor"
            :key="q.key"
            class="q-mb-md question-row"
            :class="{ 'question-row--over': overKey === q.key && dragKey !== q.key, 'question-row--dragging': dragKey === q.key }"
            :draggable="armedKey === q.key"
            @dragstart="onDragStart(q.key, $event)"
            @dragover.prevent="overKey = q.key"
            @drop.prevent="onDrop(q.key)"
            @dragend="onDragEnd"
          >
            <q-card flat bordered :class="{ 'question-card--active': activeKey === q.key }" @click="activeKey = q.key">
              <div class="text-center drag-grip" @mousedown="armedKey = q.key"><q-icon name="drag_handle" color="grey-5" /></div>
              <q-card-section class="q-pt-none">
                <div class="row q-col-gutter-sm">
                  <div class="col-12 col-md-8">
                    <q-input v-model="q.text" filled dense :label="`Ερώτηση ${idx + 1}`" maxlength="300" color="klados" />
                  </div>
                  <div class="col-12 col-md-4">
                    <q-select v-model="q.kind" :options="kindOptions" filled dense emit-value map-options color="klados" @update:model-value="(k: DrasiReviewKind) => onKindChange(q, k)">
                      <template #prepend><q-icon :name="KIND_ICON[q.kind]" /></template>
                      <template #option="scope">
                        <q-item v-bind="scope.itemProps">
                          <q-item-section avatar><q-icon :name="KIND_ICON[scope.opt.value as DrasiReviewKind]" /></q-item-section>
                          <q-item-section>{{ scope.opt.label }}</q-item-section>
                        </q-item>
                      </template>
                    </q-select>
                  </div>
                </div>
                <q-input v-model="q.description" borderless dense placeholder="Περιγραφή (προαιρετικά)" maxlength="1000" class="q-mt-xs" />

                <!-- ── Σώμα ανά είδος ── -->
                <div class="q-mt-sm">
                  <div v-if="q.kind === 'TEXT'" class="text-grey-6 answer-ghost">Κείμενο σύντομης απάντησης</div>
                  <div v-else-if="q.kind === 'PARAGRAPH'" class="text-grey-6 answer-ghost answer-ghost--long">Κείμενο μεγάλης απάντησης</div>

                  <template v-else-if="isChoice(q.kind)">
                    <div v-for="(_, oi) in q.options" :key="oi" class="row items-center no-wrap q-mb-xs">
                      <q-icon :name="q.kind === 'CHOICE' ? 'radio_button_unchecked' : 'check_box_outline_blank'" color="grey-6" class="q-mr-sm" />
                      <q-input v-model="q.options[oi]" dense borderless class="col" :placeholder="`Επιλογή ${oi + 1}`" maxlength="200" @keyup.enter="addOption(q)" />
                      <q-btn flat dense round size="sm" icon="close" color="grey-7" :disable="q.options.length <= 1" @click="q.options.splice(oi, 1)" />
                    </div>
                    <div class="row items-center no-wrap">
                      <q-icon :name="q.kind === 'CHOICE' ? 'radio_button_unchecked' : 'check_box_outline_blank'" color="grey-4" class="q-mr-sm" />
                      <q-btn flat dense no-caps color="klados" label="Προσθήκη επιλογής" @click="addOption(q)" />
                    </div>
                  </template>

                  <template v-else>
                    <div class="row items-center q-col-gutter-sm">
                      <div class="col-12 col-sm-4"><q-input v-model="q.scaleLow" dense outlined label="Ετικέτα για το 1" maxlength="60" color="klados" /></div>
                      <div class="col-12 col-sm-4 text-center text-grey-7">
                        <span v-for="n in scaleMax(q.kind)" :key="n" class="scale-dot">{{ n }}</span>
                      </div>
                      <div class="col-12 col-sm-4"><q-input v-model="q.scaleHigh" dense outlined :label="`Ετικέτα για το ${scaleMax(q.kind)}`" maxlength="60" color="klados" /></div>
                    </div>
                  </template>
                </div>
              </q-card-section>
              <q-separator />
              <q-card-actions align="right" class="q-px-md">
                <q-btn flat dense round icon="content_copy" color="grey-7" @click.stop="duplicate(idx)"><q-tooltip>Αντίγραφο</q-tooltip></q-btn>
                <q-btn flat dense round icon="delete" color="grey-7" @click.stop="editor.splice(idx, 1)"><q-tooltip>Διαγραφή</q-tooltip></q-btn>
                <q-separator vertical class="q-mx-sm" />
                <q-toggle v-model="q.required" label="Υποχρεωτική" color="klados" left-label dense />
              </q-card-actions>
            </q-card>
          </div>

          <div v-if="!editor.length" class="text-center text-grey-6 q-pa-lg">
            Χωρίς ερωτήσεις η αξιολόγηση δεν εμφανίζεται σε κανέναν. Ξεκίνα με ό,τι θέλεις να μάθεις — π.χ. «Πόσο καλά δούλεψε η τροφοδοσία;» (κλίμακα) ή «Τι θα άλλαζες στο πρόγραμμα;» (παράγραφος).
          </div>
          <q-btn outline color="klados" icon="add_circle_outline" label="Προσθήκη ερώτησης" class="q-mt-sm" @click="addQuestion" />
        </q-tab-panel>

        <!-- ══════════ Απαντήσεις ══════════ -->
        <q-tab-panel name="responses" class="q-pa-none">
          <div class="row items-center q-gutter-sm q-mb-md">
            <div class="text-h6">{{ view.summary?.respondents ?? 0 }} {{ (view.summary?.respondents ?? 0) === 1 ? 'απάντηση' : 'απαντήσεις' }}</div>
            <q-space />
            <q-btn flat color="klados" icon="download" label="Λήψη Excel" :disable="!view.summary?.respondents" :loading="downloading" @click="download" />
            <q-toggle v-model="settings.acceptingResponses" label="Δέχεται απαντήσεις" color="klados" left-label />
          </div>

          <template v-if="view.summary?.respondents">
            <q-btn-toggle v-model="respView" dense unelevated toggle-color="klados" toggle-text-color="klados-on" :options="[{ label: 'Σύνοψη', value: 'summary' }, { label: 'Ατομικά', value: 'individual' }]" class="q-mb-md" />

            <!-- Σύνοψη -->
            <template v-if="respView === 'summary'">
              <q-card v-for="q in view.questions" :key="q.id" flat bordered class="q-mb-md">
                <q-card-section>
                  <div class="text-body1 text-weight-medium">{{ q.text }}</div>
                  <div class="text-caption text-grey-7 q-mb-sm">{{ summaryOf(q.id)?.count ?? 0 }} απαντήσεις<span v-if="summaryOf(q.id)?.average !== null && summaryOf(q.id)?.average !== undefined"> · μέσος όρος {{ summaryOf(q.id)?.average }}</span></div>
                  <template v-if="summaryOf(q.id)?.distribution.length">
                    <div v-for="d in summaryOf(q.id)!.distribution" :key="d.label" class="row items-center no-wrap q-mb-xs">
                      <div class="dist-label ellipsis">{{ d.label }}</div>
                      <div class="col dist-track"><div class="dist-bar" :style="{ width: pct(d.count, summaryOf(q.id)!.count, q.kind) }" /></div>
                      <div class="dist-count text-caption text-grey-8">{{ d.count }}<span v-if="summaryOf(q.id)!.count"> ({{ Math.round((d.count / summaryOf(q.id)!.count) * 100) }}%)</span></div>
                    </div>
                  </template>
                  <q-list v-else dense>
                    <q-item v-for="(t, i) in summaryOf(q.id)?.texts ?? []" :key="i" class="q-px-none">
                      <q-item-section>
                        <q-item-label class="pre-line">{{ t.text }}</q-item-label>
                        <q-item-label v-if="!settings.anonymous" caption>{{ t.user }}</q-item-label>
                      </q-item-section>
                    </q-item>
                    <div v-if="!summaryOf(q.id)?.texts.length" class="text-caption text-grey-6">Καμία απάντηση.</div>
                  </q-list>
                </q-card-section>
              </q-card>
            </template>

            <!-- Ατομικά -->
            <template v-else-if="currentResponse">
              <q-card flat bordered>
                <q-card-section class="row items-center no-wrap q-gutter-sm">
                  <q-btn flat round dense icon="chevron_left" :disable="respIndex === 0" @click="respIndex--" />
                  <q-input :model-value="respIndex + 1" type="number" dense outlined style="width: 72px" :min="1" :max="view.summary.responses.length" @update:model-value="(v) => (respIndex = Math.min(Math.max(Number(v) - 1, 0), view!.summary!.responses.length - 1))" />
                  <span class="text-grey-7">από {{ view.summary.responses.length }}</span>
                  <q-btn flat round dense icon="chevron_right" :disable="respIndex >= view.summary.responses.length - 1" @click="respIndex++" />
                  <q-space />
                  <div class="text-right">
                    <div class="text-weight-medium">{{ currentResponse.user }}</div>
                    <div class="text-caption text-grey-7">{{ formatDateTime(currentResponse.submittedAt) }}</div>
                  </div>
                  <q-btn flat round dense icon="delete" color="negative" @click="removeResponse(currentResponse)"><q-tooltip>Διαγραφή απάντησης</q-tooltip></q-btn>
                </q-card-section>
                <q-separator />
                <q-card-section>
                  <div v-for="q in view.questions" :key="q.id" class="q-mb-md">
                    <div class="text-caption text-grey-7">{{ q.text }}</div>
                    <div class="pre-line">{{ answerText(currentResponse, q) }}</div>
                  </div>
                </q-card-section>
              </q-card>
            </template>
          </template>
          <div v-else class="text-center text-grey-6 q-pa-lg">
            <q-icon name="inbox" size="40px" class="block q-mb-sm" />
            Καμία απάντηση ακόμη.
          </div>
        </q-tab-panel>

        <!-- ══════════ Ρυθμίσεις ══════════ -->
        <q-tab-panel name="settings" class="q-pa-none">
          <q-card flat bordered>
            <q-list>
              <q-item-label header>Απαντήσεις</q-item-label>
              <q-item tag="label">
                <q-item-section>
                  <q-item-label>Δέχεται απαντήσεις</q-item-label>
                  <q-item-label caption>Κλείσε το όταν τελειώσει η αξιολόγηση — η φόρμα μένει ορατή, χωρίς υποβολή.</q-item-label>
                </q-item-section>
                <q-item-section side><q-toggle v-model="settings.acceptingResponses" color="klados" /></q-item-section>
              </q-item>
              <q-item>
                <q-item-section>
                  <q-item-label>Ποιοι απαντούν</q-item-label>
                  <q-option-group v-model="settings.audience" :options="audienceOptions" color="klados" class="q-mt-xs" />
                </q-item-section>
              </q-item>
              <q-item tag="label">
                <q-item-section>
                  <q-item-label>Ανώνυμη</q-item-label>
                  <q-item-label caption>Τα ονόματα δεν εμφανίζονται πουθενά — ούτε στη σύνοψη, ούτε στη λήψη. Παραμένει μία απάντηση ανά άτομο.</q-item-label>
                </q-item-section>
                <q-item-section side><q-toggle v-model="settings.anonymous" color="klados" /></q-item-section>
              </q-item>
              <q-item tag="label">
                <q-item-section>
                  <q-item-label>Αλλαγή απάντησης μετά την υποβολή</q-item-label>
                </q-item-section>
                <q-item-section side><q-toggle v-model="settings.allowEdit" color="klados" /></q-item-section>
              </q-item>
              <q-separator spaced />
              <q-item-label header>Μετά την υποβολή</q-item-label>
              <q-item tag="label">
                <q-item-section>
                  <q-item-label>Εμφάνιση σύνοψης στους απαντώντες</q-item-label>
                  <q-item-label caption>Όποιος απαντήσει βλέπει τη σύνοψη των απαντήσεων (χωρίς ονόματα αν η φόρμα είναι ανώνυμη).</q-item-label>
                </q-item-section>
                <q-item-section side><q-toggle v-model="settings.showSummary" color="klados" /></q-item-section>
              </q-item>
              <q-item>
                <q-item-section>
                  <q-input v-model="settings.confirmationMessage" label="Μήνυμα επιβεβαίωσης" outlined dense maxlength="500" color="klados" />
                </q-item-section>
              </q-item>
            </q-list>
          </q-card>
        </q-tab-panel>

        <!-- ══════════ Η φόρμα προς συμπλήρωση ══════════ -->
        <q-tab-panel name="fill" class="q-pa-none">
          <div v-if="!view.questions.length" class="text-center text-grey-6 q-pa-lg">Δεν έχει οριστεί αξιολόγηση για αυτή τη δράση.</div>
          <ReviewQuestionsForm
            v-else
            v-model:just-submitted="justSubmitted"
            :questions="view.questions"
            :settings="settings"
            :default-title="defaultTitle"
            :mine-answers="view.mine"
            :mine-submitted-at="view.mineSubmittedAt"
            :can-answer="view.canAnswer"
            :cannot-answer-reason="view.cannotAnswerReason"
            :summary="canWrite ? null : view.summary"
            :submitting="submitting"
            @submit="submit"
          />
        </q-tab-panel>
      </q-tab-panels>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useQuasar } from 'quasar';
import {
  DEFAULT_REVIEW_SETTINGS,
  DRASI_FORM_STATUS_LABEL,
  DRASI_REVIEW_AUDIENCE_LABEL,
  FORM_LINK_TTL_DAYS,
  DRASI_REVIEW_CHOICE_KINDS,
  DRASI_REVIEW_KIND_LABEL,
  DRASI_REVIEW_SCALE_MAX,
  DrasiReviewAudience,
  DrasiReviewKind,
  type DrasiFormStatus,
  type DrasiReviewInviteView,
  type DrasiReviewQuestionView,
  type DrasiReviewResponse,
  type DrasiReviewSettings,
  type DrasiReviewShareView,
  type DrasiReviewView,
  type IssuedReviewLink,
} from '@trifylli/shared';
import { copyToClipboard } from 'quasar';
import SaveStatus from '../SaveStatus.vue';
import ReviewQuestionsForm, { type ReviewAnswerPayload } from './ReviewQuestionsForm.vue';
import { ApiError, OfflineError, del, downloadFile, get, patch, post, put } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/format';
import type { SaveState } from '../../lib/save-state';

const props = defineProps<{ drasiId: string; canWrite: boolean; drasiTitle?: string }>();
const $q = useQuasar();
const loading = ref(false);
const view = ref<DrasiReviewView | null>(null);
const tab = ref(props.canWrite ? 'questions' : 'fill');
const defaultTitle = computed(() => `Αξιολόγηση${props.drasiTitle ? ` — ${props.drasiTitle}` : ''}`);

const KIND_ICON: Record<DrasiReviewKind, string> = {
  TEXT: 'short_text',
  PARAGRAPH: 'notes',
  CHOICE: 'radio_button_checked',
  CHECKBOX: 'check_box',
  SCALE_1_5: 'linear_scale',
  SCALE_1_10: 'linear_scale',
};
const kindOptions = (Object.keys(DrasiReviewKind) as DrasiReviewKind[]).map((k) => ({ label: DRASI_REVIEW_KIND_LABEL[k], value: k }));
const audienceOptions = (Object.keys(DrasiReviewAudience) as DrasiReviewAudience[]).map((a) => ({ label: DRASI_REVIEW_AUDIENCE_LABEL[a], value: a }));
const isChoice = (k: DrasiReviewKind): boolean => DRASI_REVIEW_CHOICE_KINDS.includes(k);
const scaleMax = (k: DrasiReviewKind): number => DRASI_REVIEW_SCALE_MAX[k] ?? 5;

// ── Φόρτωση ──
async function reload(): Promise<void> {
  loading.value = true;
  try {
    apply(await get<DrasiReviewView>(`/draseis/${props.drasiId}/review`));
  } catch (err) {
    notifyError(err, 'Αποτυχία φόρτωσης αξιολόγησης.');
  } finally {
    loading.value = false;
  }
}
/** Ό,τι έρχεται από τον server γίνεται η νέα βάση — και το στιγμιότυπο, για να μη μετρήσει ως αλλαγή. */
function apply(v: DrasiReviewView): void {
  view.value = v;
  Object.assign(settings, v.settings);
  // Ids νέων ερωτήσεων: ο server τις γυρνά με τη σειρά που στάλθηκαν.
  if (editor.length === v.questions.length) v.questions.forEach((q, i) => (editor[i]!.id = q.id));
  else editor.splice(0, editor.length, ...v.questions.map(toEditorRow));
  lastSaved.questions = serializeQuestions();
  lastSaved.settings = JSON.stringify(settings);
}
onMounted(reload);

// ── Ρυθμίσεις (αυτόματη αποθήκευση) ──
const settings = reactive<DrasiReviewSettings>({ ...DEFAULT_REVIEW_SETTINGS });

// ── Ερωτήσεις (αυτόματη αποθήκευση) ──
interface EditorRow {
  key: number;
  id?: string;
  text: string;
  description: string;
  kind: DrasiReviewKind;
  required: boolean;
  options: string[];
  scaleLow: string;
  scaleHigh: string;
}
let nextKey = 1;
const editor = reactive<EditorRow[]>([]);
const activeKey = ref<number | null>(null);
function toEditorRow(q: DrasiReviewQuestionView): EditorRow {
  return { key: nextKey++, id: q.id, text: q.text, description: q.description ?? '', kind: q.kind, required: q.required, options: [...q.options], scaleLow: q.scaleLow ?? '', scaleHigh: q.scaleHigh ?? '' };
}
function addQuestion(): void {
  const row: EditorRow = { key: nextKey++, text: '', description: '', kind: 'TEXT', required: false, options: [], scaleLow: '', scaleHigh: '' };
  editor.push(row);
  activeKey.value = row.key;
}
function duplicate(idx: number): void {
  const src = editor[idx]!;
  const copy: EditorRow = { ...src, key: nextKey++, options: [...src.options] };
  delete copy.id;
  editor.splice(idx + 1, 0, copy);
  activeKey.value = copy.key;
}
function addOption(q: EditorRow): void {
  q.options.push('');
}
function onKindChange(q: EditorRow, kind: DrasiReviewKind): void {
  if (isChoice(kind) && !q.options.length) q.options.push('Επιλογή 1');
}
function serializeQuestions(): string {
  return JSON.stringify(questionsPayload());
}
function questionsPayload() {
  return editor
    .filter((q) => q.text.trim())
    .map((q) => ({
      ...(q.id ? { id: q.id } : {}),
      text: q.text.trim(),
      description: q.description.trim() || null,
      kind: q.kind,
      required: q.required,
      ...(isChoice(q.kind) ? { options: q.options.map((o) => o.trim()).filter(Boolean) } : {}),
      ...(DRASI_REVIEW_SCALE_MAX[q.kind] ? { scaleLow: q.scaleLow.trim() || null, scaleHigh: q.scaleHigh.trim() || null } : {}),
    }));
}

const AUTOSAVE_DELAY_MS = 1200;
const saveStatus = ref<SaveState>('clean');
const lastSaved = { questions: '', settings: '' };
let timer: ReturnType<typeof setTimeout> | null = null;
function schedule(): void {
  if (!props.canWrite) return;
  saveStatus.value = 'pending';
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void saveNow(), AUTOSAVE_DELAY_MS);
}
watch(editor, () => {
  if (serializeQuestions() !== lastSaved.questions) schedule();
}, { deep: true });
watch(settings, () => {
  if (JSON.stringify(settings) !== lastSaved.settings) schedule();
}, { deep: true });

async function saveNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const q = serializeQuestions();
  const s = JSON.stringify(settings);
  const qDirty = q !== lastSaved.questions;
  const sDirty = s !== lastSaved.settings;
  if (!qDirty && !sDirty) {
    saveStatus.value = saveStatus.value === 'pending' ? 'clean' : saveStatus.value;
    return;
  }
  saveStatus.value = 'saving';
  try {
    let v: DrasiReviewView | null = null;
    if (sDirty) v = await patch<DrasiReviewView>(`/draseis/${props.drasiId}/review/settings`, JSON.parse(s));
    if (qDirty) v = await put<DrasiReviewView>(`/draseis/${props.drasiId}/review/questions`, { questions: JSON.parse(q) });
    if (v) {
      // Κρατάμε τις γραμμές του editor όπως είναι (ο χρήστης μπορεί να γράφει ακόμη)· παίρνουμε ids και την υπόλοιπη εικόνα.
      view.value = v;
      const saved = v.questions.filter(Boolean);
      const sent = editor.filter((x) => x.text.trim());
      if (saved.length === sent.length) saved.forEach((sq, i) => (sent[i]!.id = sq.id));
      lastSaved.questions = serializeQuestions();
      lastSaved.settings = JSON.stringify(settings);
    }
    saveStatus.value = serializeQuestions() !== lastSaved.questions || JSON.stringify(settings) !== lastSaved.settings ? 'pending' : 'saved';
  } catch (err) {
    if (err instanceof OfflineError) {
      saveStatus.value = 'offline';
      return;
    }
    saveStatus.value = 'error';
    notifyError(err, 'Αποτυχία αποθήκευσης.');
  }
}
onBeforeUnmount(() => {
  if (timer) void saveNow();
});

// ── Σειρά ερωτήσεων με σύρσιμο (από τη λαβή) ──
const armedKey = ref<number | null>(null);
const dragKey = ref<number | null>(null);
const overKey = ref<number | null>(null);
function onDragStart(key: number, ev: DragEvent): void {
  dragKey.value = key;
  ev.dataTransfer?.setData('text/plain', String(key));
}
function onDragEnd(): void {
  dragKey.value = null;
  overKey.value = null;
  armedKey.value = null;
}
function onDrop(targetKey: number): void {
  const from = dragKey.value;
  onDragEnd();
  if (from === null || from === targetKey) return;
  const fromIdx = editor.findIndex((q) => q.key === from);
  const toIdx = editor.findIndex((q) => q.key === targetKey);
  if (fromIdx < 0 || toIdx < 0) return;
  const [moved] = editor.splice(fromIdx, 1);
  editor.splice(toIdx, 0, moved!);
}

// ── Απαντήσεις (διαχειριστής) ──
const respView = ref<'summary' | 'individual'>('summary');
const respIndex = ref(0);
const downloading = ref(false);
const currentResponse = computed(() => view.value?.summary?.responses[respIndex.value] ?? null);
watch(() => view.value?.summary?.responses.length ?? 0, (n) => {
  if (respIndex.value >= n) respIndex.value = Math.max(0, n - 1);
});
function summaryOf(questionId: string) {
  return view.value?.summary?.questions.find((q) => q.questionId === questionId) ?? null;
}
/** Πλάτος μπάρας: στα πλαίσια ελέγχου το σύνολο μπορεί να ξεπερνά τους απαντώντες, οπότε κανονικοποιούμε στη μεγαλύτερη. */
function pct(count: number, total: number, kind: DrasiReviewKind): string {
  if (!total) return '0%';
  if (kind === 'CHECKBOX') {
    const max = Math.max(...(summaryOfKind(kind) ?? [1]));
    return `${Math.round((count / max) * 100)}%`;
  }
  return `${Math.round((count / total) * 100)}%`;
}
function summaryOfKind(_kind: DrasiReviewKind): number[] | null {
  return view.value?.summary?.questions.flatMap((q) => q.distribution.map((d) => d.count)) ?? null;
}
function answerText(r: DrasiReviewResponse, q: DrasiReviewQuestionView): string {
  const a = r.answers.find((x) => x.questionId === q.id);
  if (!a) return '—';
  if (a.value !== null) return `${a.value} / ${scaleMax(q.kind)}`;
  if (a.choices.length) return a.choices.join(', ');
  return a.text ?? '—';
}
async function download(): Promise<void> {
  downloading.value = true;
  try {
    await downloadFile(`/draseis/${props.drasiId}/review/export.xlsx`, 'Αξιολόγηση.xlsx');
  } catch (err) {
    notifyError(err, 'Αποτυχία λήψης.');
  } finally {
    downloading.value = false;
  }
}
function removeResponse(r: DrasiReviewResponse): void {
  $q.dialog({
    title: 'Διαγραφή απάντησης',
    message: `Η απάντηση «${r.user}» θα διαγραφεί οριστικά. Συνέχεια;`,
    cancel: { label: 'Άκυρο', flat: true },
    ok: { label: 'Διαγραφή', color: 'negative' },
  }).onOk(async () => {
    try {
      apply(await del<DrasiReviewView>(`/draseis/${props.drasiId}/review/responses/${r.key}`));
    } catch (err) {
      notifyError(err, 'Αποτυχία διαγραφής.');
    }
  });
}

// ── Η δική μου απάντηση (το component κρατά τις τιμές· εδώ μόνο η αποστολή) ──
const submitting = ref(false);
const justSubmitted = ref(false);
async function submit(answers: ReviewAnswerPayload[]): Promise<void> {
  submitting.value = true;
  try {
    apply(await put<DrasiReviewView>(`/draseis/${props.drasiId}/review/answers`, { answers }));
    justSubmitted.value = true;
  } catch (err) {
    notifyError(err, 'Αποτυχία υποβολής.');
  } finally {
    submitting.value = false;
  }
}

// ── Αποστολή: δημόσιοι σύνδεσμοι ανά συμμετέχοντα (παιδιά χωρίς λογαριασμό) ──
const sendDialog = ref(false);
const invites = ref<DrasiReviewInviteView[]>([]);
const issued = ref<IssuedReviewLink[]>([]);
const issuing = ref(false);
const copying = ref<string | null>(null);
const inviteName = (pid: string): string => {
  const i = invites.value.find((x) => x.participantId === pid);
  return i ? `${i.user.lastName} ${i.user.firstName}` : '';
};
function inviteColor(s: DrasiFormStatus): string {
  return { PENDING: 'grey-6', SENT: 'blue-7', OPENED: 'orange-7', SUBMITTED: 'positive', VOID: 'grey-8' }[s];
}
async function loadInvites(): Promise<void> {
  try {
    invites.value = await get<DrasiReviewInviteView[]>(`/draseis/${props.drasiId}/review/invites`);
  } catch (err) {
    notifyError(err, 'Αποτυχία φόρτωσης.');
  }
}
async function openSend(): Promise<void> {
  await saveNow();
  issued.value = [];
  shareUrl.value = '';
  await Promise.all([loadInvites(), loadShare()]);
  sendDialog.value = true;
}

// ── Κοινός σύνδεσμος ──
const share = ref<DrasiReviewShareView | null>(null);
const shareUrl = ref('');
const sharing = ref(false);
async function loadShare(): Promise<void> {
  try {
    share.value = await get<DrasiReviewShareView>(`/draseis/${props.drasiId}/review/share`);
  } catch {
    share.value = null;
  }
}
async function createShare(): Promise<void> {
  sharing.value = true;
  try {
    shareUrl.value = (await post<{ url: string }>(`/draseis/${props.drasiId}/review/share`)).url;
    await copyText(shareUrl.value);
    await loadShare();
  } catch (err) {
    notifyError(err, 'Αποτυχία δημιουργίας συνδέσμου.');
  } finally {
    sharing.value = false;
  }
}
async function revokeShare(): Promise<void> {
  sharing.value = true;
  try {
    share.value = await del<DrasiReviewShareView>(`/draseis/${props.drasiId}/review/share`);
    shareUrl.value = '';
  } catch (err) {
    notifyError(err, 'Αποτυχία.');
  } finally {
    sharing.value = false;
  }
}
function whatsappShare(url: string): string {
  const text = `Γεια σας! Θα θέλαμε τη γνώμη σας για τη δράση «${props.drasiTitle ?? ''}» — συμπληρώστε την αξιολόγηση εδώ: ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
async function issueInvites(body: { participantIds?: string[]; reissue?: boolean }): Promise<void> {
  issuing.value = true;
  try {
    issued.value = await post<IssuedReviewLink[]>(`/draseis/${props.drasiId}/review/invites`, body);
    if (!issued.value.length) $q.notify({ type: 'info', message: 'Δεν υπάρχει κανείς για αποστολή.' });
    await loadInvites();
  } catch (err) {
    notifyError(err, 'Αποτυχία έκδοσης.');
  } finally {
    issuing.value = false;
  }
}
/** Έκδοση (ή επανέκδοση) για ένα άτομο και αντιγραφή κατευθείαν — για «χάθηκε ο σύνδεσμος». */
async function copyInvite(i: DrasiReviewInviteView): Promise<void> {
  copying.value = i.participantId;
  try {
    const links = await post<IssuedReviewLink[]>(`/draseis/${props.drasiId}/review/invites`, { participantIds: [i.participantId], reissue: true });
    const link = links[0];
    if (!link) {
      $q.notify({ type: 'info', message: 'Δεν εκδόθηκε σύνδεσμος.' });
      return;
    }
    await copyText(link.url);
    await loadInvites();
  } catch (err) {
    notifyError(err, 'Αποτυχία έκδοσης.');
  } finally {
    copying.value = null;
  }
}
async function voidInvite(i: DrasiReviewInviteView): Promise<void> {
  if (!i.inviteId) return;
  try {
    await del(`/draseis/${props.drasiId}/review/invites/${i.inviteId}`);
    await loadInvites();
  } catch (err) {
    notifyError(err, 'Αποτυχία.');
  }
}
function whatsapp(l: IssuedReviewLink): string {
  const text = `Γεια σου! Θα θέλαμε τη γνώμη σου για τη δράση «${props.drasiTitle ?? ''}» — συμπλήρωσε την αξιολόγηση εδώ: ${l.url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
async function copyText(text: string): Promise<void> {
  try {
    await copyToClipboard(text);
    $q.notify({ type: 'positive', message: 'Αντιγράφηκε.' });
  } catch {
    $q.notify({ type: 'warning', message: 'Δεν επιτρέπεται η αντιγραφή — επίλεξέ το με το χέρι.' });
  }
}

function notifyError(err: unknown, fallback: string): void {
  $q.notify({ type: 'negative', message: err instanceof ApiError ? err.message : fallback });
}
</script>

<style scoped>
.form-head {
  border-top: 8px solid var(--klados-color);
}
.form-title {
  font-size: 1.5rem;
  font-weight: 600;
}
.form-title :deep(input) {
  font-size: 1.5rem;
  font-weight: 600;
}
.question-card--active {
  border-left: 5px solid var(--klados-color);
}
.question-card--error {
  border-color: var(--q-negative);
}
.drag-grip {
  cursor: grab;
  line-height: 1;
  padding-top: 2px;
}
.question-row--dragging {
  opacity: 0.4;
}
.question-row--over {
  box-shadow: 0 -3px 0 var(--klados-ink);
}
.answer-ghost {
  border-bottom: 1px dotted rgba(0, 0, 0, 0.3);
  max-width: 60%;
  padding: 4px 0;
}
.answer-ghost--long {
  max-width: 85%;
}
.scale-toggle {
  border: 1px solid rgba(0, 0, 0, 0.12);
}
.scale-dot {
  display: inline-block;
  width: 28px;
  text-align: center;
}
.dist-label {
  width: 140px;
  flex: 0 0 140px;
  font-size: 0.85rem;
}
.dist-track {
  background: rgba(0, 0, 0, 0.06);
  border-radius: 4px;
  height: 18px;
  overflow: hidden;
}
.dist-bar {
  background: var(--klados-color);
  height: 100%;
  transition: width 0.3s;
}
.dist-count {
  width: 84px;
  flex: 0 0 84px;
  text-align: right;
}
.pre-line {
  white-space: pre-line;
}
</style>
