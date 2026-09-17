import path from 'node:path';
import type { PrismaConfig } from 'prisma';

// Το Prisma δεν φορτώνει πια μόνο του το .env όταν υπάρχει αρχείο ρυθμίσεων.
for (const file of ['.env', '../../.env']) {
  try {
    process.loadEnvFile(path.join(__dirname, file));
  } catch {
    // Απουσία αρχείου είναι αποδεκτή: σε CI/containers οι μεταβλητές έρχονται από το περιβάλλον.
  }
}

export default {
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
} satisfies PrismaConfig;
