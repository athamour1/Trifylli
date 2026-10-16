import type { RequestUser } from '../../common/auth/types';

/** Τι επιτρέπεται σε μια σύνδεση: γράφει ή μόνο βλέπει. Καμία πρόσβαση = `null`. */
export type CollabAccess = 'write' | 'read';

/**
 * Ένα είδος κοινού εγγράφου — π.χ. «ατζέντα και πρακτικά συμβουλίου».
 *
 * Το δηλώνει το module που έχει την οντότητα (βλ. `symvoulia`), γιατί εκεί
 * ζουν οι κανόνες της: ποιος γράφει, ποια πεδία, πώς σώζονται. Το collab δεν
 * έχει δικά του δικαιώματα — ρωτά τα υπάρχοντα.
 */
export interface CollabDocumentType {
  /**
   * Το είδος, όπως γράφεται στο όνομα: `symvoulio` → `symvoulio:<uuid>`,
   * `drasi:mythos` → `drasi:<uuid>:mythos`, `drasi:item` → `drasi:<uuid>:item:<uuid>`.
   */
  readonly kind: string;
  /** Πόσα ids έχει το όνομα (1 ή 2) — π.χ. δράση και στοιχείο του ωρολογίου. */
  readonly arity: 1 | 2;
  /** Τα πεδία του εγγράφου — ένα `Y.Text` ανά πεδίο. */
  readonly fields: readonly string[];
  /** Ίδιος κανόνας με το `GET` (βλέπει) και το `PATCH` (γράφει) της οντότητας. */
  access(user: RequestUser, ids: readonly string[]): Promise<CollabAccess | null>;
  /** Οι τιμές των πεδίων στη βάση — για το πρώτο γέμισμα. `null` αν η οντότητα δεν υπάρχει. */
  load(ids: readonly string[]): Promise<Record<string, string> | null>;
  /** Γράφει τις απλές τιμές στα πεδία της οντότητας (εκτύπωση, εξαγωγές, `GET`). */
  project(ids: readonly string[], values: Record<string, string>): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Τα είδη εγγράφων και η ανάγνωση των ονομάτων τους.
 *
 * Τα ονόματα έχουν αυστηρή μορφή (`είδος:uuid`, πεζά): ένα όνομα που δεν
 * ταιριάζει δεν είναι «νέο έγγραφο», είναι απόρριψη — δεν υπάρχουν ελεύθερα
 * έγγραφα που φτιάχνει όποιος θέλει.
 */
export class CollabDocumentRegistry {
  private readonly types = new Map<string, CollabDocumentType>();

  register(type: CollabDocumentType): void {
    if (this.types.has(type.kind)) throw new Error(`Το είδος εγγράφου «${type.kind}» δηλώθηκε δύο φορές.`);
    this.types.set(type.kind, type);
  }

  resolve(name: string): { type: CollabDocumentType; ids: string[] } | null {
    if (name.length > 160) return null;
    // είδος:id · είδος:id:υποείδος · είδος:id:υποείδος:id
    const [base, first, sub, second, ...rest] = name.split(':');
    if (!base || !first || rest.length) return null;
    const kind = sub === undefined ? base : `${base}:${sub}`;
    const ids = second === undefined ? [first] : [first, second];
    const type = this.types.get(kind);
    if (!type || type.arity !== ids.length || !ids.every((id) => UUID.test(id))) return null;
    return { type, ids };
  }
}
