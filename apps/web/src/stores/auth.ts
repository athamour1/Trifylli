import { defineStore } from 'pinia';
import type { AccountRole, Capability, KladosGrants, KladosType } from '@trifylli/shared';
import { can as canDo, KLADOS_LABEL } from '@trifylli/shared';
import { get } from '../lib/api';
import { useOfflineStore } from './offline';

interface MeResponse {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: AccountRole;
    roleLabel: string;
    adminKlados: KladosType | null;
    isSuperAdmin: boolean;
    /** Οι κλάδοι που βλέπει — ένας για τον διαχειριστή κλάδου, όλοι για τον υπερδιαχειριστή. */
    kladoi: { type: KladosType; label: string; color: string; icon: string }[];
    /** Στελέχη: δικαιώματα ανά κλάδο (βαθμός e-SEO + υπευθυνότητες αρχηγείου). */
    grants?: KladosGrants | null;
  };
  topiko: { id: string; name: string; location: string | null; timezone: string } | null;
  currentPeriod: { id: string; label: string; syndromiAmount: number } | null;
  labels: Record<string, Record<string, string>>;
}

/**
 * Το προφίλ του χρήστη και τα δικαιώματά του.
 *
 * Ο έλεγχος `can()` είναι ο **ίδιος κώδικας** με το API (`@trifylli/shared`),
 * ώστε το UI να μην δείχνει ποτέ κουμπί ή διαδρομή που ο server θα απορρίψει.
 * Παραμένει μόνο υπόδειξη: η επιβολή γίνεται στον server.
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    profile: null as MeResponse | null,
    loading: false,
    error: null as string | null,
  }),

  getters: {
    ready: (state) => state.profile !== null,
    user: (state) => state.profile?.user ?? null,
    topiko: (state) => state.profile?.topiko ?? null,
    kladoi: (state) => state.profile?.user.kladoi ?? [],
    currentPeriod: (state) => state.profile?.currentPeriod ?? null,

    isSuperAdmin: (state) => state.profile?.user.isSuperAdmin ?? false,
    adminKlados: (state) => state.profile?.user.adminKlados ?? null,

    displayName: (state) =>
      state.profile ? `${state.profile.user.firstName} ${state.profile.user.lastName}`.trim() : '',

    roleLabel: (state) => state.profile?.user.roleLabel ?? '',

    accessProfile: (state) =>
      state.profile
        ? { role: state.profile.user.role, adminKlados: state.profile.user.adminKlados, grants: state.profile.user.grants ?? null }
        : null,
  },

  actions: {
    async load(): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const offline = useOfflineStore();
        const { data } = await offline.cachedGet('me', () => get<MeResponse>('/me'));
        this.profile = data;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },

    /** Ίδιοι κανόνες με τα guards του API. */
    can(capability: Capability, klados?: KladosType): boolean {
      const profile = this.accessProfile;
      return profile ? canDo(profile, capability, klados) : false;
    },

    /** Βλέπει ο χρήστης αυτόν τον κλάδο; */
    seesKlados(klados: KladosType): boolean {
      return this.kladoi.some((k) => k.type === klados);
    },

    kladosLabel(type: KladosType): string {
      return KLADOS_LABEL[type];
    },
  },
});
