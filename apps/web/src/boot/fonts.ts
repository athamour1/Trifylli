import { defineBoot } from '#q-app/wrappers';
// Η Inter από το bundle (όχι από fonts.googleapis.com): δουλεύει offline, δεν
// στέλνει IP χρηστών στην Google, και περνά την CSP (`font-src 'self'`). Τα
// αρχεία έχουν ελληνικό υποσύνολο (unicode-range) — φορτώνει μόνο ό,τι χρειάζεται.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';

export default defineBoot(() => {
  // Τίποτα να τρέξει: τα imports αρκούν.
});
