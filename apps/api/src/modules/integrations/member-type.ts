import { Idiotita, KladosType, MemberKind } from '@trifylli/shared';

/**
 * Αντιστοίχιση του τύπου μέλους του e-SEO στα δικά μας enums.
 *
 * Σε αντίθεση με ό,τι υποθέταμε αρχικά, το e-SEO **δεν** στέλνει ελεύθερο κείμενο
 * για τον κλάδο: στέλνει ένα κλειστό enum (`OrgMemberDTO.type`). Οπότε η
 * αντιστοίχιση είναι ντετερμινιστική — καμία κανονικοποίηση ή fuzzy σύγκριση.
 *
 * Οι τιμές επιβεβαιώθηκαν από το live OpenAPI (`/app/eseo/api/v3/api-docs`).
 */

/** Οι τιμές του `OrgMemberDTO.type` στο e-SEO. */
export const ESEO_MEMBER_TYPES = [
  'STAR',
  'BIRD',
  'GUIDE',
  'NAVY_GUIDE',
  'BIG_GUIDE',
  'BIG_NAVY_GUIDE',
  'ADULT_LEADER',
  'LOCAL_COUNCIL_MEMBER',
  'COOP_GROUP_MEMBER',
  'CONFERENCE_MEMBER',
  'FRIEND_OF_GUIDING',
] as const;
export type EseoMemberType = (typeof ESEO_MEMBER_TYPES)[number];

const KNOWN = new Set<string>(ESEO_MEMBER_TYPES);

/**
 * Τύποι που αντιστοιχούν σε κλάδο. Οι ναυτικοί κλάδοι (`NAVY_*`) πέφτουν στον
 * ίδιο κλάδο με τους στεριανούς — το Trifylli δεν ξεχωρίζει στεριά/θάλασσα, και
 * αυτό το Τοπικό (ΜΕΓΑΡΑ) λειτουργεί στεριανά ούτως ή άλλως.
 */
const KLADOS_BY_TYPE: Record<string, KladosType> = {
  STAR: KladosType.ASTERIA,
  BIRD: KladosType.POULIA,
  GUIDE: KladosType.ODIGOI,
  NAVY_GUIDE: KladosType.ODIGOI,
  BIG_GUIDE: KladosType.MEGALOI_ODIGOI,
  BIG_NAVY_GUIDE: KladosType.MEGALOI_ODIGOI,
};

/**
 * Τα παιδιά/έφηβοι των τεσσάρων κλάδων είναι `MELOS`. Οποιοσδήποτε άλλος τύπος
 * (αρχηγός, μέλος συμβουλίου, συνεργαζόμενη ομάδα, φίλος του οδηγισμού) είναι
 * ενήλικας και μετράει ως `STELEXOS` για τα στατιστικά κατασκήνωσης.
 */
const CHILD_TYPES = new Set<string>([
  'STAR',
  'BIRD',
  'GUIDE',
  'NAVY_GUIDE',
  'BIG_GUIDE',
  'BIG_NAVY_GUIDE',
]);

function key(type: string | null | undefined): string {
  return (type ?? '').trim().toUpperCase();
}

/** `true` αν το e-SEO έστειλε τύπο που ξέρουμε (για να μη θορυβεί ο έλεγχος κάτω). */
export function isKnownEseoType(type: string | null | undefined): boolean {
  return KNOWN.has(key(type));
}

/**
 * Κλάδος του μέλους, ή `null` όταν ο τύπος δεν ανήκει σε κλάδο (ενήλικες,
 * συμβούλια) ή είναι άγνωστος — τότε το μέλος συγχρονίζεται χωρίς τοποθέτηση και
 * το τακτοποιεί το Τοπικό.
 */
export function mapEseoTypeToKlados(type: string | null | undefined): KladosType | null {
  return KLADOS_BY_TYPE[key(type)] ?? null;
}

/** Τι είναι το άτομο στο μητρώο — παιδί/μέλος ή ενήλικο στέλεχος. */
export function eseoTypeToMemberKind(type: string | null | undefined): MemberKind {
  return CHILD_TYPES.has(key(type)) ? MemberKind.MELOS : MemberKind.STELEXOS;
}

/**
 * Η «ιδιότητα» του ατόμου από το e-SEO `type`. Οι ναυτικοί κλάδοι ενώνονται με
 * τους στεριανούς (όπως και στην τοποθέτηση σε κλάδο).
 */
const IDIOTITA_BY_TYPE: Record<string, Idiotita> = {
  STAR: Idiotita.ASTERI,
  BIRD: Idiotita.POULI,
  GUIDE: Idiotita.ODIGOS,
  NAVY_GUIDE: Idiotita.ODIGOS,
  BIG_GUIDE: Idiotita.MEGALOS_ODIGOS,
  BIG_NAVY_GUIDE: Idiotita.MEGALOS_ODIGOS,
  ADULT_LEADER: Idiotita.STELEXOS,
  LOCAL_COUNCIL_MEMBER: Idiotita.TOPIKO_SYMVOULIO,
  COOP_GROUP_MEMBER: Idiotita.OMADA_SYNERGASIAS,
  CONFERENCE_MEMBER: Idiotita.SYNDIASKEPSI,
  FRIEND_OF_GUIDING: Idiotita.FILOS_ODIGISMOU,
};

export function eseoTypeToIdiotita(type: string | null | undefined): Idiotita | null {
  return IDIOTITA_BY_TYPE[key(type)] ?? null;
}
