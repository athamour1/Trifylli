import { PrismaClient } from '@prisma/client';
import { KLADOS_LABEL, KLADOS_META, KladosType } from '@trifylli/shared';

/**
 * Πρώτο στήσιμο σε παραγωγή: το Τοπικό, οι τέσσερις κλάδοι και η τρέχουσα
 * οδηγική χρονιά. Τρέχει μετά τα migrations και δεν κάνει τίποτα αν η βάση
 * έχει ήδη Τοπικό — τα μέλη έρχονται από τον συγχρονισμό με το e-SEO.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    if (await prisma.topiko.count()) {
      console.log('bootstrap: υπάρχει ήδη Τοπικό — τίποτα να γίνει');
      return;
    }

    const name = process.env.TOPIKO_NAME?.trim() || 'Τοπικό Τμήμα';
    const location = process.env.TOPIKO_LOCATION?.trim() || null;
    const eseoCode = process.env.TOPIKO_ESEO_CODE?.trim() || null;
    const syndromi = Number(process.env.SYNDROMI_AMOUNT ?? 0) || 0;

    // Η οδηγική χρονιά ξεκινά τον Σεπτέμβριο.
    const now = new Date();
    const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;

    await prisma.$transaction(async (tx) => {
      const topiko = await tx.topiko.create({ data: { name, location, eseoCode } });
      for (const type of Object.keys(KLADOS_META) as KladosType[]) {
        const meta = KLADOS_META[type];
        await tx.klados.create({
          data: { topikoId: topiko.id, type, name: KLADOS_LABEL[type], minAge: meta.minAge, maxAge: meta.maxAge },
        });
      }
      await tx.period.create({
        data: {
          topikoId: topiko.id,
          label: `${start}–${start + 1}`,
          startDate: new Date(Date.UTC(start, 8, 1)),
          endDate: new Date(Date.UTC(start + 1, 5, 30)),
          syndromiAmount: syndromi,
          isCurrent: true,
        },
      });
    });
    console.log(`bootstrap: δημιουργήθηκε το «${name}» με τους κλάδους και τη χρονιά ${start}–${start + 1}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
