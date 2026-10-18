/** Πού ανοίγει ένα συμβούλιο στην εφαρμογή: της δράσης μέσα στη δράση του (με το συρτάρι της). */
export function symvoulioLink(symvoulio: { id: string; drasiId: string | null }): string {
  return symvoulio.drasiId ? `/draseis/${symvoulio.drasiId}/symvoulia/${symvoulio.id}` : `/symvoulia/${symvoulio.id}`;
}
