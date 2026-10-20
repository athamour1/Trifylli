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
  drasi: { view?: string[]; edit?: string[] } | null = null,
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
  const drasiAccessFake = {
    accessFor: async () => {
      if (!drasi) throw new Error('Η δράση δεν βρέθηκε.');
      return { full: false, view: drasi.view ?? [], edit: drasi.edit ?? [] };
    },
  };
  return {
    service: new FilesService(prisma as never, storage as never, new JobMonitor({}), collabFake as never, drasiAccessFake as never),
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


describe('FilesService — αρχεία που ανήκουν σε δράση', () => {
  const DRASI = fileId(80);
  const stored = (extra: Row) => ({
    id: fileId(1), topikoId: TOPIKO, objectKey: 'r/1', filename: 'apodeixi.png', contentType: 'image/png', size: 4,
    purpose: FilePurpose.RECEIPT, collabDocument: null, createdById: 'someone-else', klados: null, ...extra,
  });
  const serve = (file: Row, drasi: { view?: string[]; edit?: string[] } | null) => {
    const ctx = setup({}, 0, {}, drasi);
    Object.assign(ctx.prisma.storedFile, { findFirst: async () => file });
    return ctx.service;
  };

  it('απόδειξη στο ταμείο δράσης του Τοπικού: τη βλέπει όποιος βλέπει το ταμείο της, όχι μόνο ο υπερδιαχειριστής', async () => {
    const receipt = stored({ treasuryEntry: { drasiId: DRASI } });
    expect((await serve(receipt, { view: ['tamio'] }).openForDownload(member, fileId(1))).filename).toBe('apodeixi.png');
    await expect(serve(receipt, { view: ['programma'] }).openForDownload(member, fileId(1))).rejects.toThrow('Δεν έχετε πρόσβαση');
  });

  it('απόδειξη πληρωμής: από τη δράση του συμμετέχοντα', async () => {
    const receipt = stored({ drasiPayment: { participant: { drasiId: DRASI } } });
    expect((await serve(receipt, { view: ['tamio'] }).openForDownload(member, fileId(1))).filename).toBe('apodeixi.png');
  });

  it('υπογραφή εντύπου υγείας: θέλει και το φαρμακείο, όπως οι απαντήσεις του', async () => {
    const signature = stored({ purpose: FilePurpose.SIGNATURE, drasiForm: { drasiId: DRASI, type: 'YGEIA' } });
    await expect(serve(signature, { view: ['entypa'] }).openForDownload(member, fileId(1))).rejects.toThrow('Δεν έχετε πρόσβαση');
    expect((await serve(signature, { view: ['entypa', 'farmakeio'] }).openForDownload(member, fileId(1))).filename).toBe('apodeixi.png');
    const symmetoxi = stored({ purpose: FilePurpose.SIGNATURE, drasiForm: { drasiId: DRASI, type: 'SYMMETOXI' } });
    expect((await serve(symmetoxi, { view: ['entypa'] }).openForDownload(member, fileId(1))).filename).toBe('apodeixi.png');
  });

  it('όποιος την ανέβασε τη βλέπει πριν μπει κάπου', async () => {
    const pending = stored({ createdById: 'u-1' });
    expect((await serve(pending, null).openForDownload(member, fileId(1))).filename).toBe('apodeixi.png');
  });

  it('ο Ταμίας της δράσης ανεβάζει απόδειξη χωρίς δικαίωμα στο ταμείο του κλάδου· ο κλάδος του αρχείου είναι του διοργανωτή', async () => {
    const created: Row[] = [];
    const { service, prisma } = setup({}, 0, {}, { view: ['tamio'], edit: ['tamio'] });
    Object.assign(prisma.storedFile, { create: async ({ data }: { data: Row }) => (created.push(data), { ...data, id: fileId(5), createdAt: new Date() }) });
    Object.assign(prisma.drasi, { findUniqueOrThrow: async () => ({ kladosId: 'klados-odigoi' }) });

    await service.upload(member, { purpose: FilePurpose.RECEIPT, drasiId: DRASI }, image);

    expect(created[0]?.kladosId).toBe('klados-odigoi');
  });

  it('όποιος μόνο βλέπει το ταμείο δεν ανεβάζει απόδειξη· και μόνο αποδείξεις δένονται με δράση', async () => {
    const viewer = setup({}, 0, {}, { view: ['tamio'] });
    await expect(viewer.service.upload(member, { purpose: FilePurpose.RECEIPT, drasiId: DRASI }, image)).rejects.toThrow(
      'Δεν καταχωρείς έξοδα σε αυτή τη δράση.',
    );
    const writer = setup({}, 0, {}, { edit: ['tamio'] });
    await expect(writer.service.upload(member, { purpose: FilePurpose.MARKDOWN, drasiId: DRASI }, image)).rejects.toThrow(
      'Μόνο αποδείξεις δένονται με δράση.',
    );
  });
});

describe('FilesService — παλιές εικόνες χωρίς κοινό έγγραφο', () => {
  const ITEM = fileId(81);
  const DRASI = fileId(80);
  const legacy = { id: fileId(1), topikoId: TOPIKO, objectKey: 'md/1', filename: 'palia.png', contentType: 'image/png', size: 4, purpose: FilePurpose.MARKDOWN, collabDocument: null, createdById: null, klados: null };

  function withLegacy(items: Row[], access: 'read' | null) {
    const ctx = setup({ drasiScheduleItem: items }, 0, { access });
    const updates: Row[] = [];
    Object.assign(ctx.prisma.storedFile, {
      findFirst: async () => legacy,
      updateMany: async ({ data }: { data: Row }) => (updates.push(data), { count: 1 }),
    });
    return { ...ctx, updates };
  }

  it('τη βλέπει όποιος βλέπει το κείμενο που την αναφέρει — και δένεται μαζί του', async () => {
    const { service, updates } = withLegacy([{ id: ITEM, drasiId: DRASI, description: ref(fileId(1)), drasi: { topikoId: TOPIKO } }], 'read');

    expect((await service.openForDownload(member, fileId(1))).filename).toBe('palia.png');
    expect(updates).toEqual([{ collabDocument: `drasi:${DRASI}:item:${ITEM}` }]);
  });

  it('όποιος δεν βλέπει κανένα από τα κείμενα παίρνει άρνηση', async () => {
    const { service } = withLegacy([{ id: ITEM, drasiId: DRASI, description: ref(fileId(1)), drasi: { topikoId: TOPIKO } }], null);
    await expect(service.openForDownload(member, fileId(1))).rejects.toThrow('Δεν έχετε πρόσβαση');
  });

  it('σε δύο κείμενα δεν δένεται με κανένα — κρίνεται κάθε φορά από όλα', async () => {
    const twice = [ITEM, fileId(82)].map((id) => ({ id, drasiId: DRASI, description: ref(fileId(1)), drasi: { topikoId: TOPIKO } }));
    const { service, updates } = withLegacy(twice, 'read');

    await service.openForDownload(member, fileId(1));
    expect(updates).toEqual([]);
  });
});
