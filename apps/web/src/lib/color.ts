/**
 * Τι χρώμα κειμένου διαβάζεται πάνω σε ένα φόντο.
 *
 * Χρειάστηκε μόλις τα χρώματα των κλάδων έγιναν τα επίσημα του Σ.Ε.Ο.: το
 * κίτρινο των Πουλιών (#ffcb06) είναι τόσο ανοιχτό που άσπρο κείμενο πάνω του
 * εξαφανίζεται, ενώ το κόκκινο των Μεγάλων Οδηγών θέλει άσπρο. Σταθερό χρώμα
 * κειμένου δεν δουλεύει και για τα τέσσερα.
 */

/** Σχετική φωτεινότητα κατά WCAG 2.1. */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;

  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

/**
 * Μαύρο ή λευκό πάνω από το `background`, όποιο έχει μεγαλύτερη αντίθεση.
 *
 * Το κατώφλι 0.179 είναι το σημείο όπου η αντίθεση με το μαύρο ξεπερνά αυτή με
 * το λευκό — προκύπτει από τον τύπο της WCAG, δεν είναι εμπειρικό.
 */
export function readableOn(background: string): string {
  if (!background.startsWith('#')) return '#fff';
  return luminance(background) > 0.179 ? '#000' : '#fff';
}

/**
 * Χρώμα κειμένου για **μεγάλες επιφάνειες** — τη μπάρα εφαρμογής, τίτλους.
 *
 * Διαφορετικός κανόνας από το `readableOn`, γιατί η ερώτηση είναι άλλη. Σε ένα
 * chip 0.65rem μετράει η μέγιστη αντίθεση· σε μια μπάρα με γράμματα 21px το
 * όριο της WCAG είναι 3:1 και το περνούν και τα δύο, οπότε αποφασίζει η
 * σύμβαση: λευκό πάνω σε χρώμα. Πέφτουμε σε μαύρο μόνο όταν το λευκό πραγματικά
 * δεν φτάνει — όπως στο κίτρινο των Πουλιών, που δίνει 1.5:1.
 */
export function readableOnLarge(background: string): string {
  if (!background.startsWith('#')) return '#fff';
  const contrastWithWhite = 1.05 / (luminance(background) + 0.05);
  return contrastWithWhite >= 3 ? '#fff' : '#000';
}

/** Μέγιστη φωτεινότητα που περνά το 4.5:1 της WCAG πάνω σε λευκό (κανονικό κείμενο). */
const MAX_INK_LUMINANCE = 1.05 / 4.5 - 0.05;
/** Μέγιστη φωτεινότητα για 3:1 — το όριο της WCAG για **έντονο/μεγάλο** κείμενο. */
const MAX_INK_LUMINANCE_LARGE = 1.05 / 3 - 0.05;

/** Σκουραίνει σταδιακά το χρώμα ώσπου να πέσει κάτω από `maxLum`, κρατώντας την απόχρωση. */
function darkenToLuminance(color: string, maxLum: number): string {
  if (!color.startsWith('#')) return color;

  const value = color.slice(1);
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  const rgb = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16));

  for (let scale = 100; scale > 0; scale -= 2) {
    const shade = rgb.map((channel) => Math.round((channel * scale) / 100));
    const hex = `#${shade.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    if (luminance(hex) <= maxLum) return hex;
  }
  return '#000';
}

/**
 * Το ίδιο χρώμα, αρκετά σκούρο ώστε να διαβάζεται **ως κανονικό κείμενο** σε λευκό
 * (4.5:1). Για το κίτρινο των Πουλιών (1.5:1) σκουραίνει αισθητά.
 */
export function inkOnWhite(color: string): string {
  return darkenToLuminance(color, MAX_INK_LUMINANCE);
}

/**
 * Σαν το `inkOnWhite`, αλλά για **έντονο/μεγάλο κείμενο** (όριο 3:1). Κρατά τα
 * χρώματα πιο ζωηρά — όπως στη μπάρα: τιρκουάζ/μπλε/κόκκινο μένουν σχεδόν ως
 * έχουν, μόνο το κίτρινο γίνεται ένας αναγνώσιμος χρυσός.
 */
export function inkOnWhiteLarge(color: string): string {
  return darkenToLuminance(color, MAX_INK_LUMINANCE_LARGE);
}
