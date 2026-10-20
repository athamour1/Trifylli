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

function setup(
  content: Partial<Record<'drasi' | 'drasiScheduleItem' | 'drasiMeal' | 'drasiMealVariant' | 'drasiCharacter', Row[]>>,
  fileCount: number,
  collab: { live?: string[]; access?: 'write' | 'read' | null } = {},
) {
  const storedFile = table(
    Array.from({ length: fileCount }, (_, i) => ({
      id: fileId(i + 1),
      objectKey: `md/${i + 1}`,
      purpose: FilePurpose.MARKDOWN,
      topikoId: TOPIKO,
      createdAt: old,
      collabDocument: null as string | null,
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
    drasiMealVariant: table(content.drasiMealVariant ?? []),
    drasiCharacter: table(content.drasiCharacter ?? []),
  };
  const storage = { enabled: true, delete: async () => undefined, put: async () => undefined, getStream: async () => ({ stream: 'bytes' }) };
  const collabFake = {
    documentExists: async (name: string) => (collab.live ?? []).includes(name),
    documentAccess: async () => collab.access ?? null,
  };
  return {
    service: new FilesService(prisma as never, storage as never, new JobMonitor({}), collabFake as never),
    storedFile,
    prisma,
  };
}

/** Τα πρώτα bytes ενός PNG — αρκούν για τον έλεγχο περιεχομένου του upload. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const image = { buffer: PNG, mimetype: 'image/png', size: PNG.length, originalname: 'sxedio.png' } as Express.Multer.File;
const DOC = `drasi:${fileId(90)}:item:${fileId(91)}`;
const member = { id: 'u-1', topikoId: TOPIKO, role: 'EXTERNAL', adminKlados: null, grants: null, kladoi: [] } as never;

describe('FilesService — εικόνες Markdown των δράσεων', () => {
  it('η νυχτερινή σάρωση κρατά όσες αναφέρονται σε περιγραφή, μύθο, lore, προγραμματικό, συνταγή (και παράλληλου γεύματος)', async () => {
    const { service, storedFile } = setup(
      {
        drasi: [
          { ...live, description: ref(fileId(1)), mythosText: null },
          { ...live, description: null, mythosText: ref(fileId(2)) },
        ],
        drasiCharacter: [{ lore: ref(fileId(3)), drasi: live }],
        drasiScheduleItem: [{ description: ref(fileId(4)), drasi: live }],
        drasiMeal: [{ recipe: ref(fileId(5)), item: { drasi: live } }],
        drasiMealVariant: [{ recipe: ref(fileId(6)), item: { drasi: live } }],
      },
      7,
    );

    const removed = await service.sweepOrphanMarkdownImages();

    expect(removed).toBe(1);
    expect(storedFile.rows.map((f) => f.id)).toEqual([1, 2, 3, 4, 5, 6].map(fileId));
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

describe('FilesService — εικόνες δεμένες με κοινό έγγραφο', () => {
  it('η σάρωση κρατά όσες ανήκουν σε έγγραφο που ζει, ακόμη κι αν λείπουν από το κείμενο', async () => {
    const { service, storedFile } = setup({}, 2, { live: [DOC] });
    storedFile.rows[0]!.collabDocument = DOC;
    storedFile.rows[1]!.collabDocument = `symvoulio:${fileId(92)}`;

    expect(await service.sweepOrphanMarkdownImages()).toBe(1);
    expect(storedFile.rows.map((f) => f.id)).toEqual([fileId(1)]);
  });

  it('ανεβάζει όποιος γράφει στο έγγραφο — και εξωτερικό στέλεχος, χωρίς κλάδο', async () => {
    const created: Row[] = [];
    const { service, prisma } = setup({}, 0, { access: 'write' });
    Object.assign(prisma.storedFile, { create: async ({ data }: { data: Row }) => (created.push(data), { ...data, id: fileId(5), createdAt: new Date() }) });

    await service.upload(member, { purpose: FilePurpose.MARKDOWN, collabDocument: DOC }, image);

    expect(created[0]?.collabDocument).toBe(DOC);
  });

  it('όποιος μόνο βλέπει το έγγραφο δεν ανεβάζει εικόνα σε αυτό', async () => {
    const { service } = setup({}, 0, { access: 'read' });
    await expect(service.upload(member, { purpose: FilePurpose.MARKDOWN, collabDocument: DOC }, image)).rejects.toThrow(
      'Δεν γράφεις σε αυτό το κείμενο.',
    );
  });

  it('τη βλέπει όποιος βλέπει το έγγραφο· όποιος όχι, παίρνει άρνηση', async () => {
    const bound = { id: fileId(1), topikoId: TOPIKO, objectKey: 'md/1', filename: 'a.png', contentType: 'image/png', size: 4, purpose: FilePurpose.MARKDOWN, collabDocument: DOC, klados: null };
    const visible = setup({}, 0, { access: 'read' });
    Object.assign(visible.prisma.storedFile, { findFirst: async () => bound });
    expect((await visible.service.openForDownload(member, fileId(1))).filename).toBe('a.png');

    const hidden = setup({}, 0, { access: null });
    Object.assign(hidden.prisma.storedFile, { findFirst: async () => bound });
    await expect(hidden.service.openForDownload(member, fileId(1))).rejects.toThrow('Δεν έχετε πρόσβαση σε αυτό το αρχείο.');
  });
});

