/**
 * Όρια της συνεργασίας — ό,τι δεν μπορεί να κάνει μια σύνδεση, όσο δικαίωμα κι
 * αν έχει: πλημμύρα μηνυμάτων, εκατοντάδες ανοιχτά έγγραφα, έγγραφο που φουσκώνει
 * χωρίς τέλος (τα κείμενα είναι Markdown· οι εικόνες είναι αναφορές σε αρχεία).
 */
export const COLLAB_LIMITS = {
  /**
   * Μηνύματα ανά σύνδεση: έως 300 μαζί, και 100 το δευτερόλεπτο μετά. Ένα άτομο
   * που γράφει στέλνει ~20/s (πλήκτρα και κέρσορας)· με σύρσιμο επιλογής ως ~60.
   */
  messages: { burst: 300, perSecond: 100 },
  /** Ανοιχτά έγγραφα ανά σύνδεση (καρτέλα). Μια σελίδα ανοίγει λίγα — η δράση μαζί με τα κείμενά της, ως 10. */
  documentsPerSocket: 50,
  /** Μέγεθος εγγράφου: πάνω από αυτό σταματά να δέχεται αλλαγές. */
  documentBytes: 5 * 1024 * 1024,
} as const;

/**
 * Κουβάς μηνυμάτων (token bucket): γεμάτος στην αρχή, ξαναγεμίζει με σταθερό
 * ρυθμό. Ένας άνθρωπος που γράφει δεν τον αδειάζει ποτέ· ένα script που στέλνει
 * χωρίς σταματημό ναι.
 */
export class MessageBudget {
  private tokens: number;
  private last: number;

  constructor(
    private readonly limit: { burst: number; perSecond: number },
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = limit.burst;
    this.last = now();
  }

  /** Χωράει ένα ακόμη μήνυμα; */
  take(): boolean {
    const now = this.now();
    this.tokens = Math.min(this.limit.burst, this.tokens + ((now - this.last) / 1000) * this.limit.perSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
