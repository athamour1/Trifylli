import 'reflect-metadata';
import { resolve } from 'node:path';
import axios from 'axios';
import { HttpService } from '@nestjs/axios';
import { loadConfig } from '../src/common/config/configuration';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { EseoAuth } from '../src/modules/integrations/eseo.auth';
import { EseoClient } from '../src/modules/integrations/eseo.client';
import { EseoSyncService } from '../src/modules/integrations/eseo-sync.service';

/**
 * Εκτελεί μία φορά τον πραγματικό συγχρονισμό e-SEO, χωρίς Nest DI (το tsx/esbuild
 * δεν εκπέμπει decorator metadata), στήνοντας τα services με το χέρι. Γράφει στην
 * ίδια βάση — δεν σηκώνει HTTP server, άρα δεν συγκρούεται με το API στο :3000.
 */
async function main(): Promise<void> {
  process.loadEnvFile(resolve(process.cwd(), '.env'));

  const config = loadConfig();
  const http = new HttpService(axios.create());
  const prisma = new PrismaService();
  await prisma.$connect();

  const auth = new EseoAuth(http, config);
  const eseo = new EseoClient(http, auth, config);
  const sync = new EseoSyncService(prisma, eseo, config);

  try {
    const topiko = await prisma.topiko.findFirst({
      where: { eseoCode: { not: null } },
      select: { id: true, name: true, eseoCode: true },
    });
    if (!topiko) throw new Error('Δεν βρέθηκε Τοπικό με eseoCode.');

    console.log(`▶ Συγχρονισμός: ${topiko.name} (eseoCode=${topiko.eseoCode})`);
    const summary = await sync.syncTopiko(topiko.id);
    console.log('✓ ΣΥΝΟΨΗ:', JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('✗ ΣΦΑΛΜΑ:', err instanceof Error ? err.message : err);
  process.exit(1);
});
