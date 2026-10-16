import { ConflictException } from '@nestjs/common';

/**
 * Ένα πεδίο που έγινε κοινό έγγραφο δεν γράφεται πια με `PATCH`/`PUT`: ένα tab από
 * πριν την αλλαγή θα έστελνε όλο το κείμενο και θα έσβηνε ό,τι γράφουν οι άλλοι.
 * Του λέμε να ανανεώσει — η νέα έκδοση γράφει το κείμενο μέσω της συνεργασίας.
 */
export function refuseCollabFields(dto: object, fields: readonly string[]): void {
  const sent = dto as Record<string, unknown>;
  if (fields.some((field) => sent[field] !== undefined)) {
    throw new ConflictException('Η εφαρμογή ενημερώθηκε — ανανέωσε τη σελίδα για να συνεχίσεις.');
  }
}

/** Η απλή τιμή ενός κοινού κειμένου όπως γράφεται στη βάση: χωρίς κενά στις άκρες, `null` αν είναι άδειο. */
export function projectedText(value: string | undefined): string | null {
  return value?.trim() || null;
}
