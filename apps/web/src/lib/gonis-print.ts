/**
 * Το λογότυπο του ΣΕΟ για τα χαρτιά των γονιών (γράμμα, εξάρτυση), ως data URL:
 * το iframe εκτύπωσης δεν φορτώνει αρχεία της εφαρμογής. Φορτώνεται μόνο όταν
 * τυπώνεις — δεν βαραίνει τη σελίδα της δράσης.
 */
export async function seoLogo(): Promise<string> {
  return (await import('../assets/seo-logo.png?inline')).default;
}
