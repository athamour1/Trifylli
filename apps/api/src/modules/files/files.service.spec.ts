import { describe, expect, it } from 'vitest';
import { FilePurpose } from '@trifylli/shared';
import { JobMonitor } from '../../common/jobs/job-monitor';
import { FilesService } from './files.service';

/**
 * Βάση στη μνήμη: όσο Prisma χρειάζεται η σάρωση — `findMany`/`count` με
 * `contains`, `OR`, `lt`, `not`, ισότητα και φίλτρα σε σχέσεις (εμφωλευμένα).
 */
type Row = Record<string, unknown>;

function matches(where: Row | undefined, row: Row | undefined): boolean {
  if (!where) return true;
  if (!row) return false;
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Row[]).some((sub) => matches(sub, row));
    const value = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Row;
      if ('contains' in c) return typeof value === 'string' && value.includes(String(c.contains));
      if ('lt' in c) return value instanceof Date && value < (c.lt as Date);
      if ('not' in c) return value !== c.not;
      return matches(c, value as Row | undefined);
    }
    return value === cond;
  });
}

function table(rows: Row[]) {
  return {
    rows,
    findMany: async ({ where }: { where?: Row } = {}) => rows.filter((r) => matches(where, r)),
    findFirst: async ({ where }: { where?: Row } = {}) => rows.find((r) => matches(where, r)) ?? null,
    count: async ({ where }: { where?: Row } = {}) => rows.filter((r) => matches(where, r)).length,
    delete: async ({ where }: { where: { id: string } }) => {
      const i = rows.findIndex((r) => r.id === where.id);
      return i >= 0 ? rows.splice(i, 1)[0] : null;
    },
  };
}

const TOPIKO = 'topiko-1';
const live = { topikoId: TOPIKO, archivedAt: null };
const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
const ref = (id: string) => `Δες: ![σχέδιο](trifylli:${id})`;
const fileId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function setup(content: Partial<Record<'drasi' | 'drasiScheduleItem' | 'drasiMeal' | 'drasiCharacter', Row[]>>, fileCount: number) {
  const storedFile = table(
    Array.from({ length: fileCount }, (_, i) => ({
      id: fileId(i + 1),
      objectKey: `md/${i + 1}`,
      purpose: FilePurpose.MARKDOWN,
      topikoId: TOPIKO,
      createdAt: old,
    })),
  );
  const prisma = {
    storedFile,
    syggentrwshSection: table([]),
    timelineBlock: table([]),
    symvoulio: table([]),
    drasi: table(content.drasi ?? []),
    drasiScheduleItem: table(content.drasiScheduleItem ?? []),
    drasiMeal: table(content.drasiMeal ?? []),
    drasiCharacter: table(content.drasiCharacter ?? []),
  };
  const storage = { enabled: true, delete: async () => undefined };
  return { service: new FilesService(prisma as never, storage as never, new JobMonitor({})), storedFile };
}

describe('FilesService — εικόνες Markdown των δράσεων', () => {
  it('η νυχτερινή σάρωση κρατά όσες αναφέρονται σε περιγραφή, μύθο, lore, προγραμματικό, συνταγή', async () => {
    const { service, storedFile } = setup(
      {
        drasi: [
          { ...live, description: ref(fileId(1)), mythosText: null },
          { ...live, description: null, mythosText: ref(fileId(2)) },
        ],
        drasiCharacter: [{ lore: ref(fileId(3)), drasi: live }],
        drasiScheduleItem: [{ description: ref(fileId(4)), drasi: live }],
        drasiMeal: [{ recipe: ref(fileId(5)), item: { drasi: live } }],
      },
      6,
    );

    const removed = await service.sweepOrphanMarkdownImages();

    expect(removed).toBe(1);
    expect(storedFile.rows.map((f) => f.id)).toEqual([1, 2, 3, 4, 5].map(fileId));
  });

  it('δράση στο αρχείο: οι εικόνες της δεν μετράνε πια ως ζωντανές', async () => {
    const archived = { topikoId: TOPIKO, archivedAt: new Date() };
    const { service, storedFile } = setup({ drasiScheduleItem: [{ description: ref(fileId(1)), drasi: archived }] }, 1);

    expect(await service.sweepOrphanMarkdownImages()).toBe(1);
    expect(storedFile.rows).toEqual([]);
  });

  it('η αρχειοθέτηση συμβουλίου δεν σβήνει εικόνα που χρησιμοποιεί και ένα προγραμματικό', async () => {
    const { service, storedFile } = setup({ drasiScheduleItem: [{ description: ref(fileId(1)), drasi: live }] }, 1);

    const removed = await service.cleanupMarkdownRefs(TOPIKO, [ref(fileId(1))], { symvoulioId: 'symvoulio-1' });

    expect(removed).toBe(0);
    expect(storedFile.rows).toHaveLength(1);
  });
});
