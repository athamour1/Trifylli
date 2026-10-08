import type { AuthenticatedUser, Capability, DrasiAccess } from '@trifylli/shared';

/** Ό,τι κρεμάει το JWT strategy στο `request.user`. */
export type RequestUser = AuthenticatedUser & {
  /**
   * Το δικαίωμα του endpoint που εκτελείται — το γράφει το `CapabilityGuard`.
   * Χρειάζεται στα στελέχη, που έχουν **διαφορετικά** δικαιώματα ανά κλάδο: ο
   * έλεγχος κλάδου στο service ζητά αυτό ακριβώς το δικαίωμα σε εκείνον τον
   * κλάδο, όχι απλώς «βλέπει τον κλάδο».
   */
  activeCapability?: Capability;
  /**
   * Η πρόσβαση στη δράση του αιτήματος — τη γράφει το `DrasiPermGuard` αφού την
   * ελέγξει. Τα services της δράσης τη σέβονται αντί να ξαναελέγξουν με τον
   * γενικό κανόνα κλάδου (που δεν ξέρει τους ρόλους μέσα στη δράση).
   */
  drasiGrant?: { drasiId: string; access: DrasiAccess };
};

declare module 'express' {
  interface Request {
    user?: RequestUser;
  }
}
