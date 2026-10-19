import { ref } from 'vue';

/**
 * «Αναφορά προβλήματος» προς το GlitchTip. Ενδιάμεσο μικρό module, όπως το
 * `reporting-user`: το μενού το χρησιμοποιεί χωρίς να φέρνει το SDK στο αρχικό
 * bundle. Διαθέσιμο μόνο όταν τα extras του error tracking είναι ανοιχτά — το
 * δηλώνει το `error-reporting-extras` μόλις φορτώσει (ROADMAP §6).
 */
type Sender = (message: string) => void;

let sender: Sender | null = null;

/** Εμφανίζεται η επιλογή στο μενού; */
export const feedbackAvailable = ref(false);

export function setFeedbackSender(next: Sender): void {
  sender = next;
  feedbackAvailable.value = true;
}

export function sendFeedback(message: string): void {
  sender?.(message);
}
