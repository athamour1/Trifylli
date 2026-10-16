import { defineStore } from 'pinia';
import type { NotificationsView } from '@trifylli/shared';
import { get, post } from '../lib/api';

/**
 * Το καμπανάκι: οι τελευταίες ειδοποιήσεις και πόσες είναι αδιάβαστες. Νέες
 * φτάνουν ζωντανά από το δωμάτιο του χρήστη (βλ. `NotificationBell`), αλλιώς
 * στην επόμενη φόρτωση.
 */
export const useNotificationsStore = defineStore('notifications', {
  state: () => ({
    view: { unread: 0, items: [] } as NotificationsView,
    loaded: false,
  }),
  actions: {
    async load(): Promise<void> {
      try {
        this.view = await get<NotificationsView>('/notifications');
        this.loaded = true;
      } catch {
        // Χωρίς δίκτυο μένει ό,τι υπήρχε.
      }
    },
    async markRead(id: string): Promise<void> {
      const item = this.view.items.find((entry) => entry.id === id);
      if (item && !item.readAt) {
        item.readAt = new Date().toISOString();
        this.view.unread = Math.max(0, this.view.unread - 1);
      }
      await post(`/notifications/${id}/read`, {}).catch(() => undefined);
    },
    async markAllRead(): Promise<void> {
      const now = new Date().toISOString();
      for (const item of this.view.items) item.readAt ??= now;
      this.view.unread = 0;
      await post('/notifications/read-all', {}).catch(() => undefined);
    },
    clear(): void {
      this.view = { unread: 0, items: [] };
      this.loaded = false;
    },
  },
});
