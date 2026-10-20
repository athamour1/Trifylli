import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { sniffMime } from './sniff';
import {
  FilePurpose,
  MARKDOWN_IMAGE_MIME_TYPES,
  MAX_MARKDOWN_IMAGE_BYTES,
  MAX_RECEIPT_BYTES,
  RECEIPT_MIME_TYPES,
  type Capability,
  type KladosType,
  type StoredFileRef,
} from '@trifylli/shared';
import { JobMonitor } from '../../common/jobs/job-monitor';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import type { RequestUser } from '../../common/auth/types';
import { assertScopeAccess } from '../../common/util/klados-scope';
import { CollabService } from '../collab/collab.service';
import type { UploadFileDto } from './dto/files.dto';

/** Ποιο δικαίωμα απαιτείται για ανάγνωση/εγγραφή ανά σκοπό αρχείου. */
const PURPOSE_CAPS: Record<string, { read: Capability; write: Capability }> = {
  [FilePurpose.RECEIPT]: { read: 'treasury:read', write: 'treasury:manage' },
  // Εικόνες Markdown: δένονται στην εμβέλεια του περιεχομένου· όποιος έχει
  // πρόσβαση στον κλάδο (ή ο υπερδιαχειριστής στο Τοπικό) ανεβάζει και βλέπει.
  [FilePurpose.MARKDOWN]: { read: 'calendar:read', write: 'calendar:read' },
  // Υπογραφές εντύπων: τις βλέπει όποιος βλέπει τη δράση· δεν ανεβαίνουν από εδώ
  // (δεν έχουν PURPOSE_LIMITS), μόνο από την υποβολή του δημόσιου εντύπου.
  [FilePurpose.SIGNATURE]: { read: 'calendar:read', write: 'drasi:write' },
};

/** Όρια τύπου/μεγέθους ανά σκοπό. */
const PURPOSE_LIMITS: Record<string, { mimes: readonly string[]; maxBytes: number; error: string }> = {
  [FilePurpose.RECEIPT]: {
    mimes: RECEIPT_MIME_TYPES,
    maxBytes: MAX_RECEIPT_BYTES,
    error: 'Επιτρέπονται μόνο εικόνες ή PDF.',
  },
  [FilePurpose.MARKDOWN]: {
    mimes: MARKDOWN_IMAGE_MIME_TYPES,
    maxBytes: MAX_MARKDOWN_IMAGE_BYTES,
    error: 'Επιτρέπονται μόνο εικόνες.',
  },
};

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly jobs: JobMonitor,
    private readonly collab: CollabService,
  ) {}

  /**
   * Ημερήσια σάρωση: σβήνει εικόνες Markdown που δεν αναφέρονται πουθενά σε
   * ζωντανό περιεχόμενο — π.χ. όσες αφαιρέθηκαν από το κείμενο με επεξεργασία.
   * Περίοδος χάριτος 24ω ώστε να μη σβήνονται μόλις-ανεβασμένες που δεν έχουν
   * αποθηκευτεί ακόμη στο περιεχόμενο.
   */
  @Cron('0 4 * * *')
  async sweepOrphanMarkdownImages(): Promise<number> {
    return this.jobs.track('image-sweep', () => this.sweepOrphans(), (n) => `${n} εικόνες`);
  }

  private async sweepOrphans(): Promise<number> {
    if (!this.storage.enabled) return 0;

    const liveRefs = await this.collectLiveMarkdownRefs();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const files = await this.prisma.storedFile.findMany({
      where: { purpose: FilePurpose.MARKDOWN, createdAt: { lt: cutoff } },
      select: { id: true, objectKey: true, collabDocument: true },
    });

    let removed = 0;
    for (const file of files) {
      if (liveRefs.has(file.id)) continue;
      // Δεμένη με κοινό έγγραφο που ζει: μένει — μπορεί να τη δείχνει μια παλιότερη
      // έκδοσή του ή κάποιος που την ξαναβάζει με undo. Φεύγει μαζί με το έγγραφο.
      if (file.collabDocument && (await this.collab.documentExists(file.collabDocument))) continue;
      await this.deleteById(file.id, file.objectKey);
      removed += 1;
    }
    if (removed > 0) this.logger.log(`Σάρωση εικόνων Markdown: διαγράφηκαν ${removed} ορφανές.`);
    return removed;
  }

  /** Όλα τα file ids εικόνων που αναφέρονται σε μη-αρχειοθετημένο περιεχόμενο. */
  private async collectLiveMarkdownRefs(): Promise<Set<string>> {
    const refs = new Set<string>();
    const add = (text: string | null | undefined): void => {
      for (const id of markdownImageRefIds(text)) refs.add(id);
    };

    const sections = await this.prisma.syggentrwshSection.findMany({
      where: { notes: { contains: 'trifylli:' }, syggentrwsh: { archivedAt: null } },
      select: { notes: true },
    });
    for (const s of sections) add(s.notes);

    const blocks = await this.prisma.timelineBlock.findMany({
      where: { description: { contains: 'trifylli:' }, syggentrwsh: { archivedAt: null } },
      select: { description: true },
    });
    for (const b of blocks) add(b.description);

    const symvoulia = await this.prisma.symvoulio.findMany({
      where: {
        archivedAt: null,
        OR: [{ agenda: { contains: 'trifylli:' } }, { minutes: { contains: 'trifylli:' } }],
      },
      select: { agenda: true, minutes: true },
    });
    for (const sv of symvoulia) {
      add(sv.agenda);
      add(sv.minutes);
    }

    for (const text of await this.drasiMarkdownTexts({ archivedAt: null }, 'trifylli:')) add(text);

    return refs;
  }

  /**
   * Τα κείμενα Markdown των δράσεων που περιέχουν το `needle`: περιγραφή, μύθος,
   * lore ρόλων, προγραμματικά, συνταγές. Κάθε νέο πεδίο Markdown δράσης μπαίνει
   * εδώ — αλλιώς η νυχτερινή σάρωση θεωρεί τις εικόνες του ορφανές και τις σβήνει.
   */
  private async drasiMarkdownTexts(drasi: Prisma.DrasiWhereInput, needle: string): Promise<(string | null)[]> {
    const [draseis, characters, items, meals, variants] = await Promise.all([
      this.prisma.drasi.findMany({
        where: { ...drasi, OR: [{ description: { contains: needle } }, { mythosText: { contains: needle } }] },
        select: { description: true, mythosText: true },
      }),
      this.prisma.drasiCharacter.findMany({ where: { lore: { contains: needle }, drasi }, select: { lore: true } }),
      this.prisma.drasiScheduleItem.findMany({ where: { description: { contains: needle }, drasi }, select: { description: true } }),
      this.prisma.drasiMeal.findMany({ where: { recipe: { contains: needle }, item: { drasi } }, select: { recipe: true } }),
      this.prisma.drasiMealVariant.findMany({ where: { recipe: { contains: needle }, item: { drasi } }, select: { recipe: true } }),
    ]);
    return [
      ...draseis.flatMap((d) => [d.description, d.mythosText]),
      ...characters.map((c) => c.lore),
      ...items.map((i) => i.description),
      ...meals.map((m) => m.recipe),
      ...variants.map((v) => v.recipe),
    ];
  }

  async upload(
    user: RequestUser,
    dto: UploadFileDto,
    file: Express.Multer.File | undefined,
  ): Promise<StoredFileRef> {
    if (!file) throw new BadRequestException('Δεν στάλθηκε αρχείο.');
    const caps = PURPOSE_CAPS[dto.purpose];
    const limits = PURPOSE_LIMITS[dto.purpose];
    if (!caps || !limits) throw new BadRequestException('Άγνωστος σκοπός αρχείου.');

    if (!limits.mimes.includes(file.mimetype)) throw new BadRequestException(limits.error);
    if (file.size > limits.maxBytes) throw new BadRequestException('Το αρχείο υπερβαίνει το όριο μεγέθους.');

    // Ο τύπος που δηλώνει ο client είναι απλώς ό,τι είπε ο client. Διαβάζουμε τα
    // πρώτα bytes: ένα HTML με όνομα `apodeixi.png` και mimetype `image/png` θα
    // περνούσε τον παραπάνω έλεγχο και θα σερβιριζόταν μετά από το API μας.
    const actualMime = sniffMime(file.buffer);
    if (!actualMime || !limits.mimes.includes(actualMime)) {
      throw new BadRequestException(
        `Το περιεχόμενο του αρχείου δεν είναι ${describeMimes(limits.mimes)} (ανιχνεύθηκε: ${actualMime ?? 'άγνωστο'}).`,
      );
    }

    if (dto.collabDocument) {
      // Εικόνα κοινού εγγράφου: την ανεβάζει όποιος γράφει στο έγγραφο — και ένα
      // εξωτερικό στέλεχος ή ένα στέλεχος άλλου κλάδου που γράφει το προγραμματικό του.
      if (dto.purpose !== FilePurpose.MARKDOWN) throw new BadRequestException('Μόνο εικόνες κειμένου δένονται με έγγραφο.');
      if ((await this.collab.documentAccess(user, dto.collabDocument)) !== 'write') {
        throw new ForbiddenException('Δεν γράφεις σε αυτό το κείμενο.');
      }
    } else {
      assertScopeAccess(user, caps.write, dto.kladosType);
    }
    const kladosId = await this.resolveKladosId(user, dto.kladosType);

    const objectKey = `${dto.purpose.toLowerCase()}/${user.topikoId}/${randomUUID()}-${safeName(file.originalname)}`;
    await this.storage.put(objectKey, file.buffer, actualMime);

    const stored = await this.prisma.storedFile.create({
      data: {
        topikoId: user.topikoId,
        kladosId,
        purpose: dto.purpose,
        objectKey,
        filename: file.originalname,
        contentType: actualMime,
        size: file.size,
        createdById: user.id,
        collabDocument: dto.collabDocument ?? null,
      },
    });
    return toRef(stored);
  }

  /** Μεταδεδομένα + stream, με έλεγχο εμβέλειας. Για το streaming στον client. */
  async openForDownload(user: RequestUser, id: string) {
    const file = await this.prisma.storedFile.findFirst({
      where: { id, topikoId: user.topikoId },
      include: { klados: { select: { type: true } } },
    });
    if (!file) throw new NotFoundException('Το αρχείο δεν βρέθηκε.');
    if (file.collabDocument) {
      // Τη βλέπει όποιος βλέπει το έγγραφο όπου ανέβηκε.
      if (!(await this.collab.documentAccess(user, file.collabDocument))) {
        throw new ForbiddenException('Δεν έχετε πρόσβαση σε αυτό το αρχείο.');
      }
    } else {
      const caps = PURPOSE_CAPS[file.purpose];
      assertScopeAccess(user, caps?.read ?? 'treasury:read', file.klados?.type as KladosType | undefined);
    }

    const { stream } = await this.storage.getStream(file.objectKey);
    return { stream, filename: file.filename, contentType: file.contentType, size: file.size };
  }

  async remove(user: RequestUser, id: string) {
    const file = await this.prisma.storedFile.findFirst({
      where: { id, topikoId: user.topikoId },
      include: { klados: { select: { type: true } } },
    });
    if (!file) throw new NotFoundException('Το αρχείο δεν βρέθηκε.');
    const caps = PURPOSE_CAPS[file.purpose];
    assertScopeAccess(user, caps?.write ?? 'treasury:manage', file.klados?.type as KladosType | undefined);
    await this.deleteById(file.id, file.objectKey);
    return { deleted: true };
  }

  /** Διαγραφή χωρίς έλεγχο — ο καλών (π.χ. treasury) έχει ήδη εξουσιοδοτηθεί. */
  async deleteById(id: string, objectKey: string): Promise<void> {
    await this.storage.delete(objectKey).catch(() => undefined);
    await this.prisma.storedFile.delete({ where: { id } }).catch(() => undefined);
  }

  /**
   * Καθαρίζει τις εικόνες Markdown που αναφέρονται στα δοσμένα κείμενα — όταν
   * διαγράφεται το περιεχόμενο που τις φιλοξενούσε. Μια εικόνα διαγράφεται μόνο
   * αν δεν χρησιμοποιείται σε άλλο **ζωντανό** περιεχόμενο (ασφάλεια έναντι
   * κοινόχρηστης εικόνας).
   */
  async cleanupMarkdownRefs(
    topikoId: string,
    texts: (string | null | undefined)[],
    exclude: { syggentrwshId?: string; symvoulioId?: string } = {},
  ): Promise<number> {
    const ids = new Set<string>();
    for (const text of texts) for (const id of markdownImageRefIds(text)) ids.add(id);

    let removed = 0;
    for (const id of ids) {
      if (await this.refUsedElsewhere(topikoId, id, exclude)) continue;
      const file = await this.prisma.storedFile.findFirst({
        where: { id, topikoId, purpose: FilePurpose.MARKDOWN },
        select: { id: true, objectKey: true },
      });
      if (file) {
        await this.deleteById(file.id, file.objectKey);
        removed += 1;
      }
    }
    return removed;
  }

  /** Αναφέρεται η εικόνα σε άλλο μη-αρχειοθετημένο περιεχόμενο; */
  private async refUsedElsewhere(
    topikoId: string,
    id: string,
    exclude: { syggentrwshId?: string; symvoulioId?: string },
  ): Promise<boolean> {
    const needle = `trifylli:${id}`;
    const syggWhere = {
      klados: { topikoId },
      archivedAt: null,
      ...(exclude.syggentrwshId ? { id: { not: exclude.syggentrwshId } } : {}),
    };

    const inSections = await this.prisma.syggentrwshSection.count({
      where: { notes: { contains: needle }, syggentrwsh: syggWhere },
    });
    if (inSections > 0) return true;

    const inBlocks = await this.prisma.timelineBlock.count({
      where: { description: { contains: needle }, syggentrwsh: syggWhere },
    });
    if (inBlocks > 0) return true;

    const inSymvoulia = await this.prisma.symvoulio.count({
      where: {
        topikoId,
        archivedAt: null,
        ...(exclude.symvoulioId ? { id: { not: exclude.symvoulioId } } : {}),
        OR: [{ agenda: { contains: needle } }, { minutes: { contains: needle } }],
      },
    });
    if (inSymvoulia > 0) return true;

    return (await this.drasiMarkdownTexts({ topikoId, archivedAt: null }, needle)).length > 0;
  }

  private async resolveKladosId(user: RequestUser, kladosType?: KladosType): Promise<string | null> {
    if (!kladosType) return null;
    const klados = await this.prisma.klados.findUnique({
      where: { topikoId_type: { topikoId: user.topikoId, type: kladosType } },
      select: { id: true },
    });
    if (!klados) throw new BadRequestException(`Ο κλάδος ${kladosType} δεν υπάρχει.`);
    return klados.id;
  }
}

function toRef(f: {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: Date;
}): StoredFileRef {
  return {
    id: f.id,
    filename: f.filename,
    contentType: f.contentType,
    size: f.size,
    createdAt: f.createdAt.toISOString(),
  };
}

function describeMimes(mimes: readonly string[]): string {
  return mimes.includes('application/pdf') ? 'εικόνα ή PDF' : 'εικόνα';
}

function safeName(name: string): string {
  return name.replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 120) || 'file';
}

/** Τα file ids εικόνων `![](trifylli:ID)` μέσα σε ένα Markdown κείμενο. */
function markdownImageRefIds(text: string | null | undefined): string[] {
  if (!text) return [];
  const ids: string[] = [];
  const re = /!\[[^\]]*\]\(trifylli:([0-9a-fA-F-]{36})\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) ids.push(match[1]!);
  return ids;
}
