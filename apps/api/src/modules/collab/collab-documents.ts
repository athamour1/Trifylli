import type { CollabVersionPart, CommentPerson } from '@trifylli/shared';
import type { Doc } from 'yjs';
import type { RequestUser } from '../../common/auth/types';
import { setText } from './collab-restore';
import { readFields, seedTexts } from './collab-yjs';

/** Τι επιτρέπεται σε μια σύνδεση: γράφει ή μόνο βλέπει. Καμία πρόσβαση = `null`. */
export type CollabAccess = 'write' | 'read';

/** Ένα έγγραφο όπως φαίνεται έξω από αυτό — στις ειδοποιήσεις των σχολίων. */
export interface CollabDocumentAbout {
  /**
   * Πού, με την πρόθεσή του — «στο «Πεζοπορία» — δράση «Κατασκήνωση»» — ώστε να
   * δένει με το «Νέο σχόλιο …». Τι και μέσα σε τι, ποτέ ονόματα παιδιών.
   */
  title: string;
  /** Διαδρομή της εφαρμογής (π.χ. `/draseis/<id>/programma/<itemId>`). */
  link: string;
  /** Όσοι μαθαίνουν κάθε νέο σχόλιο — π.χ. οι υπεύθυνοι του στοιχείου. */
  watchers: string[];
  /** Πού γράφεται ένα νέο σχόλιο στη ροή δραστηριότητας (π.χ. το δωμάτιο της δράσης). */
  activity?: { room: string; topic: string };
}

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
  /**
   * Δωμάτιο: χωρίς περιεχόμενο — μόνο ποιος είναι εκεί και τα μηνύματα του
   * server (βλ. `CollabService.broadcast`). Δεν φορτώνεται, δεν σώζεται, και
   * κανείς δεν γράφει σε αυτό.
   */
  readonly room?: boolean;
  /** Ίδιος κανόνας με το `GET` (βλέπει) και το `PATCH` (γράφει) της οντότητας. */
  access(user: RequestUser, ids: readonly string[]): Promise<CollabAccess | null>;
  /**
   * Η έκδοση της δομής (βλ. `COLLAB_SCHEMA_KEY`) — 1 όταν λείπει. Ανεβαίνει όταν
   * το είδος αποκτά πεδία· τότε χρειάζεται και `upgrade`.
   */
  readonly schema?: number;
  /** Πρώτο γέμισμα του (άδειου) εγγράφου από τη βάση. `false` αν η οντότητα δεν υπάρχει. */
  seed(doc: Doc, ids: readonly string[]): Promise<boolean>;
  /**
   * Σωσμένο έγγραφο παλιότερης δομής (`from`): γεμίζει από τη βάση **μόνο** τα
   * πεδία που ήρθαν μετά. `false` αν η οντότητα δεν υπάρχει.
   */
  upgrade?(doc: Doc, ids: readonly string[], from: number): Promise<boolean>;
  /** Γράφει την κατάσταση του εγγράφου στην οντότητα (εκτύπωση, εξαγωγές, `GET`). */
  project(doc: Doc, ids: readonly string[]): Promise<void>;
  /** Για τα σχόλια: τίτλος, σύνδεσμος και ποιοι μαθαίνουν. `null` αν η οντότητα δεν υπάρχει. */
  about?(ids: readonly string[]): Promise<CollabDocumentAbout | null>;
  /** Τα στελέχη που αναφέρονται με «@» στα σχόλια — ποτέ παιδιά. */
  people?(ids: readonly string[]): Promise<CommentPerson[]>;
  /**
   * Για το ιστορικό: η απλή μορφή του εγγράφου (κείμενα, λίστες) — ό,τι κρατά μια
   * έκδοση και ό,τι επαναφέρεται. Χωρίς αυτό, το είδος δεν έχει ιστορικό.
   */
  snapshot?(doc: Doc): Record<string, unknown>;
  /** Μια έκδοση όπως διαβάζεται: κομμάτια με τίτλο, οι λίστες ως γραμμές. */
  present?(content: Record<string, unknown>): CollabVersionPart[];
  /** Το έγγραφο γίνεται όπως η έκδοση, με τις μικρότερες αλλαγές (βλ. `setText`, `setRows`). */
  restore?(doc: Doc, content: Record<string, unknown>): void;
}

/**
 * Το συνηθισμένο είδος: απλά κείμενα, ένα `Y.Text` ανά πεδίο, που γράφονται ως
 * τιμές στα αντίστοιχα πεδία της οντότητας.
 */
export function textDocument(spec: {
  kind: string;
  arity: 1 | 2;
  fields: readonly string[];
  access(user: RequestUser, ids: readonly string[]): Promise<CollabAccess | null>;
  /** Οι τιμές των πεδίων στη βάση· `null` αν η οντότητα δεν υπάρχει. */
  load(ids: readonly string[]): Promise<Record<string, string> | null>;
  /** Γράφει τις τιμές στην οντότητα. */
  save(ids: readonly string[], values: Record<string, string>): Promise<void>;
  /** Ο τίτλος κάθε πεδίου στο ιστορικό («Ατζέντα», «Πρακτικά»). */
  labels: Record<string, string>;
  about?(ids: readonly string[]): Promise<CollabDocumentAbout | null>;
  people?(ids: readonly string[]): Promise<CommentPerson[]>;
}): CollabDocumentType {
  return {
    kind: spec.kind,
    arity: spec.arity,
    access: (user, ids) => spec.access(user, ids),
    ...(spec.about ? { about: spec.about } : {}),
    ...(spec.people ? { people: spec.people } : {}),
    snapshot: (doc) => readFields(doc, spec.fields),
    present: (content) => spec.fields.map((field) => ({ key: field, label: spec.labels[field] ?? field, text: String(content[field] ?? '') })),
    restore: (doc, content) => {
      doc.transact(() => {
        for (const field of spec.fields) setText(doc.getText(field), String(content[field] ?? ''));
      });
    },
    seed: async (doc, ids) => {
      const values = await spec.load(ids);
      if (!values) return false;
      seedTexts(doc, values);
      return true;
    },
    project: (doc, ids) => spec.save(ids, readFields(doc, spec.fields)),
  };
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
