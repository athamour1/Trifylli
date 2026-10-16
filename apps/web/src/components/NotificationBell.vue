<template>
  <q-btn flat dense round icon="notifications" :aria-label="label">
    <q-badge v-if="store.view.unread" floating rounded color="negative" :label="store.view.unread > 99 ? '99+' : store.view.unread" />
    <q-menu anchor="bottom right" self="top right" @show="void store.load()">
      <q-card style="width: min(360px, 94vw)">
        <q-card-section class="row items-center q-py-sm">
          <div class="text-subtitle2 col">Ειδοποιήσεις</div>
          <q-btn v-if="store.view.unread" flat dense no-caps size="sm" color="klados" label="Όλες διαβάστηκαν" @click="store.markAllRead()" />
        </q-card-section>
        <q-separator />
        <q-list v-if="store.view.items.length" separator class="notification-list">
          <q-item v-for="item in store.view.items" :key="item.id" v-close-popup clickable :class="{ 'notification--unread': !item.readAt }" @click="open(item)">
            <q-item-section avatar>
              <q-icon :name="ICON[item.kind] ?? 'notifications'" :color="item.readAt ? 'grey-6' : 'klados'" />
            </q-item-section>
            <q-item-section>
              <q-item-label :lines="2">{{ item.title }}</q-item-label>
              <q-item-label caption>{{ formatDateTime(item.createdAt) }}</q-item-label>
            </q-item-section>
          </q-item>
        </q-list>
        <div v-else class="text-caption text-grey-7 q-pa-md text-center">Καμία ειδοποίηση.</div>
        <q-separator />
        <q-card-actions align="right">
          <q-btn v-close-popup flat dense no-caps size="sm" icon="tune" label="Ρυθμίσεις" :to="{ name: 'settings' }" />
        </q-card-actions>
      </q-card>
    </q-menu>
  </q-btn>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { collabDocument, type NotificationView } from '@trifylli/shared';
import { useCollabDoc, useCollabMe } from '../composables/useCollabDoc';
import { formatDateTime } from '../lib/format';
import { useNotificationsStore } from '../stores/notifications';

/**
 * Το καμπανάκι στη μπάρα: αριθμός αδιάβαστων και λίστα. Οι νέες φτάνουν αμέσως
 * από το δωμάτιο του χρήστη (`user:<id>`), πάνω στη σύνδεση που υπάρχει ήδη.
 */
const props = defineProps<{ userId: string }>();

const ICON: Record<string, string> = {
  role: 'badge',
  responsible: 'assignment_ind',
  mention: 'alternate_email',
  comment: 'chat_bubble_outline',
  approval: 'task_alt',
  reminder: 'alarm',
  announcement: 'campaign',
  headcount: 'groups',
  poll: 'how_to_vote',
};

const router = useRouter();
const store = useNotificationsStore();
const label = computed(() => (store.view.unread ? `Ειδοποιήσεις — ${store.view.unread} αδιάβαστες` : 'Ειδοποιήσεις'));

void store.load();
const inbox = useCollabDoc(collabDocument.user(props.userId), useCollabMe(), { persist: false });
inbox.onChange((change) => {
  if (change.topic === 'notifications' || change.topic === '*') void store.load();
});

function open(item: NotificationView): void {
  void store.markRead(item.id);
  if (item.link) void router.push(item.link);
}
</script>

<style scoped lang="scss">
.notification-list {
  max-height: min(60vh, 480px);
  overflow-y: auto;
}
.notification--unread {
  background: color-mix(in srgb, var(--klados-ink, var(--q-primary)) 8%, transparent);
  font-weight: 500;
}
</style>
