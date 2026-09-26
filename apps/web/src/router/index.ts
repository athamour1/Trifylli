import { defineRouter } from '#q-app/wrappers';
import { createMemoryHistory, createRouter, createWebHashHistory, createWebHistory } from 'vue-router';
import routes from './routes';
import { useSessionStore } from '../stores/session';
import { useAuthStore } from '../stores/auth';

export default defineRouter(() => {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : process.env.VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory;

  const router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createHistory(process.env.VUE_ROUTER_BASE),
  });

  /**
   * Φύλακας πρόσβασης.
   *
   * Δύο ξεχωριστοί έλεγχοι, γιατί αποτυγχάνουν για διαφορετικό λόγο και θέλουν
   * διαφορετική απάντηση: χωρίς **συνεδρία** στέλνουμε για login· με συνεδρία
   * αλλά χωρίς **λογαριασμό** λέμε ότι δεν υπάρχει πρόσβαση, γιατί το login
   * ξανά δεν πρόκειται να βοηθήσει.
   */
  router.beforeEach(async (to) => {
    if (to.meta.public) return true;

    const session = useSessionStore();
    if (!session.ready) await session.init();

    if (!session.authenticated) {
      return { name: 'login', query: { returnTo: to.fullPath } };
    }

    const auth = useAuthStore();
    if (!auth.ready && !auth.error) await auth.load();

    if (to.meta.superAdmin && !auth.isSuperAdmin) {
      return { name: 'dashboard' };
    }

    return true;
  });

  return router;
});
