<template>
  <div class="comment-item">
    <div class="row items-center no-wrap">
      <q-avatar size="24px" class="comment-item__face" :style="{ background: color }" text-color="white">{{ initials }}</q-avatar>
      <div class="col q-ml-sm comment-item__meta">
        <span class="text-weight-medium">{{ name }}</span>
        <span class="text-caption text-grey-7 q-ml-xs">
          {{ ago(comment.createdAt) }}<template v-if="comment.editedAt"> · διορθώθηκε</template>
        </span>
      </div>
      <slot name="actions" />
      <q-btn v-if="mine" flat round dense size="sm" icon="more_vert" aria-label="Επιλογές σχολίου">
        <q-menu auto-close anchor="bottom right" self="top right">
          <q-list dense style="min-width: 160px">
            <q-item clickable @click="emit('edit')">
              <q-item-section avatar><q-icon name="edit" size="18px" /></q-item-section>
              <q-item-section>Διόρθωση</q-item-section>
            </q-item>
            <q-item clickable @click="emit('remove')">
              <q-item-section avatar><q-icon name="delete" size="18px" color="negative" /></q-item-section>
              <q-item-section>Διαγραφή</q-item-section>
            </q-item>
          </q-list>
        </q-menu>
      </q-btn>
    </div>
    <div class="comment-item__body">
      <template v-for="(part, index) in parts" :key="index">
        <span v-if="part.mention" class="comment-mention">{{ part.text }}</span>
        <template v-else>{{ part.text }}</template>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { collabColor, type CommentView } from '@trifylli/shared';
import { splitMentions } from '../../lib/comments';
import { formatDateTime } from '../../lib/format';

/** Ένα σχόλιο: ποιος, πότε, τι — με τις @αναφορές επισημασμένες. Διόρθωση και διαγραφή μόνο ο συντάκτης. */
const props = defineProps<{ comment: CommentView; meId: string | null }>();
const emit = defineEmits<{ edit: []; remove: [] }>();

const mine = computed(() => !!props.meId && props.comment.author?.id === props.meId);
const name = computed(() => (props.comment.author ? `${props.comment.author.firstName} ${props.comment.author.lastName}` : 'Λογαριασμός που δεν υπάρχει πια'));
const color = computed(() => (props.comment.author ? collabColor(props.comment.author.id) : '#9e9e9e'));
const initials = computed(() =>
  props.comment.author ? `${props.comment.author.firstName.charAt(0)}${props.comment.author.lastName.charAt(0)}`.toLocaleUpperCase('el') : '?',
);
const parts = computed(() => splitMentions(props.comment.body, props.comment.mentions));

/** «μόλις τώρα», «πριν 5΄», «πριν 3 ώρες» — μετά, η ημερομηνία. */
function ago(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'μόλις τώρα';
  if (minutes < 60) return `πριν ${minutes}΄`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? 'πριν 1 ώρα' : `πριν ${hours} ώρες`;
  return formatDateTime(iso);
}
</script>

<style scoped lang="scss">
.comment-item__face {
  font-size: 11px;
  font-weight: 600;
  flex: none;
}
.comment-item__meta {
  min-width: 0;
  line-height: 1.3;
}
.comment-item__body {
  margin: 4px 0 0 32px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.45;
}
.comment-mention {
  color: var(--klados-ink);
  font-weight: 600;
}
</style>
