import type { AuthenticatedUser, Capability } from '@trifylli/shared';

/** Ό,τι κρεμάει το JWT strategy στο `request.user`. */
export type RequestUser = AuthenticatedUser & {
  /**
   * Το δικαίωμα του endpoint που εκτελείται — το γράφει το `CapabilityGuard`.
   * Χρειάζεται στα στελέχη, που έχουν **διαφορετικά** δικαιώματα ανά κλάδο: ο
   * έλεγχος κλάδου στο service ζητά αυτό ακριβώς το δικαίωμα σε εκείνον τον
   * κλάδο, όχι απλώς «βλέπει τον κλάδο».
   */
  activeCapability?: Capability;
};

declare module 'express' {
  interface Request {
    user?: RequestUser;
  }
}
