import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberKind } from '@prisma/client';
import {
  CHARACTER_OWN_FIELDS,
  COLLAB_FIELDS,
  collabDocument,
  drasiEditScope,
  fieldsOutside,
  type DrasiCharacterView,
  type DrasiMythosStelexos,
  type DrasiMythosView,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { refuseCollabFields } from '../collab/collab-fields';
import { CollabService } from '../collab/collab.service';
import { DrasiAccessService } from './drasi-access.service';
import type { CreateCharacterDto, OrderCharactersDto, UpdateCharacterDto, UpdateMythosDto } from './dto/drasi-mythos.dto';

const stelexosSelect = { id: true, user: { select: { id: true, firstName: true, lastName: true } } } as const;

/**
 * Ο μύθος της δράσης: η κεντρική ιδέα και οι ρόλοι των στελεχών μέσα της.
 *
 * Τα δεδομένα είναι μόνο για στελέχη — δεν υπάρχει δημόσια διαδρομή και τα
 * παιδιά δεν έχουν λογαριασμό. Ανάγνωση έχει όποιος βλέπει τη δράση (και ο
 * κλάδος που απλώς συμμετέχει: τα στελέχη του παίζουν ρόλους).
 */
@Injectable()
export class DraseisMythosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DrasiAccessService,
    private readonly collab: CollabService,
  ) {}

  async view(user: RequestUser, id: string): Promise<DrasiMythosView> {
    // Ιστορία και lore που γράφονται αυτή τη στιγμή: πρώτα στη βάση.
    await this.collab.flushPending(collabDocument.drasiPrefix(id));
    const drasi = await this.access.load(user, id, 'read');
    const [characters, stelexi] = await Promise.all([
      this.characters(id),
      this.prisma.drasiParticipant.findMany({
        where: { drasiId: id, kind: MemberKind.STELEXOS },
        select: stelexosSelect,
        orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
      }),
    ]);
    return { title: drasi.mythosTitle, text: drasi.mythosText, characters, stelexi: stelexi.map(toStelexos) };
  }

  /** Για το ντοσιέ: `null` όταν δεν έχει γραφτεί ούτε μύθος ούτε ρόλος. */
  async forDossier(user: RequestUser, id: string): Promise<Omit<DrasiMythosView, 'stelexi'> | null> {
    const { stelexi: _stelexi, ...mythos } = await this.view(user, id);
    return mythos.title || mythos.text || mythos.characters.length ? mythos : null;
  }

  async update(user: RequestUser, id: string, dto: UpdateMythosDto): Promise<DrasiMythosView> {
    // Η ιστορία γράφεται πια μαζί (`drasi:<id>:mythos`)· εδώ μόνο ο τίτλος.
    refuseCollabFields(dto, COLLAB_FIELDS.drasiMythos);
    await this.access.load(user, id, 'write');
    await this.prisma.drasi.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { mythosTitle: dto.title?.trim() || null } : {}),
        ...(dto.text !== undefined ? { mythosText: dto.text?.trim() || null } : {}),
      },
    });
    return this.view(user, id);
  }

  async createCharacter(user: RequestUser, id: string, dto: CreateCharacterDto): Promise<DrasiCharacterView> {
    await this.access.load(user, id, 'write');
    const name = this.cleanName(dto.name);
    if (dto.participantId) await this.assertStelexos(id, dto.participantId);
    const last = await this.prisma.drasiCharacter.aggregate({ where: { drasiId: id }, _max: { order: true } });
    const created = await this.prisma.drasiCharacter.create({
      data: {
        drasiId: id,
        name,
        lore: dto.lore?.trim() || null,
        participantId: dto.participantId ?? null,
        order: (last._max.order ?? -1) + 1,
      },
      include: { participant: { select: stelexosSelect } },
    });
    return toCharacter(created);
  }

  /**
   * Ο guard ζητά μόνο να βλέπει τον μύθο: όποιος παίζει τον ρόλο αλλάζει όνομα
   * και lore (`CHARACTER_OWN_FIELDS`)· ποιος τον παίζει το ορίζει το Πρόγραμμα.
   */
  async updateCharacter(user: RequestUser, id: string, characterId: string, dto: UpdateCharacterDto): Promise<DrasiCharacterView> {
    // Το lore γράφεται πια μαζί (`drasi:<id>:character:<id>`).
    refuseCollabFields(dto, COLLAB_FIELDS.drasiCharacter);
    await this.access.load(user, id, 'write');
    const character = await this.findCharacter(id, characterId);
    const grant = user.drasiGrant?.drasiId === id ? user.drasiGrant.access : null;
    const scope = drasiEditScope(grant, 'mythos', character.participant?.userId === user.id);
    if (scope === 'none') throw new ForbiddenException('Ο ρόλος σας στη δράση δεν επιτρέπει αυτή την αλλαγή.');
    if (scope === 'own' && fieldsOutside(dto, CHARACTER_OWN_FIELDS).length) {
      throw new ForbiddenException('Στον ρόλο σου αλλάζεις όνομα και lore — ποιος τον παίζει το ορίζει το Πρόγραμμα.');
    }
    if (dto.participantId) await this.assertStelexos(id, dto.participantId);
    const updated = await this.prisma.drasiCharacter.update({
      where: { id: characterId },
      data: {
        ...(dto.name !== undefined ? { name: this.cleanName(dto.name) } : {}),
        ...(dto.lore !== undefined ? { lore: dto.lore?.trim() || null } : {}),
        ...(dto.participantId !== undefined ? { participantId: dto.participantId } : {}),
      },
      include: { participant: { select: stelexosSelect } },
    });
    // Άλλο στέλεχος παίζει τον ρόλο: άλλος γράφει «το δικό του» lore.
    if (dto.participantId !== undefined) this.collab.revoke(collabDocument.drasiCharacter(id, characterId));
    return toCharacter(updated);
  }

  async deleteCharacter(user: RequestUser, id: string, characterId: string): Promise<{ ok: true }> {
    await this.access.load(user, id, 'write');
    await this.findCharacter(id, characterId);
    await this.collab.remove(collabDocument.drasiCharacter(id, characterId));
    await this.prisma.drasiCharacter.delete({ where: { id: characterId } });
    return { ok: true };
  }

  async orderCharacters(user: RequestUser, id: string, dto: OrderCharactersDto): Promise<DrasiCharacterView[]> {
    await this.access.load(user, id, 'write');
    const existing = await this.prisma.drasiCharacter.findMany({ where: { drasiId: id }, select: { id: true } });
    const known = new Set(existing.map((c) => c.id));
    if (dto.ids.length !== known.size || dto.ids.some((cid) => !known.has(cid))) {
      throw new BadRequestException('Η σειρά πρέπει να περιέχει όλους τους ρόλους της δράσης.');
    }
    await this.prisma.$transaction(
      dto.ids.map((cid, order) => this.prisma.drasiCharacter.update({ where: { id: cid }, data: { order } })),
    );
    return this.characters(id);
  }

  private async characters(drasiId: string): Promise<DrasiCharacterView[]> {
    const rows = await this.prisma.drasiCharacter.findMany({
      where: { drasiId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: { participant: { select: stelexosSelect } },
    });
    return rows.map(toCharacter);
  }

  private async findCharacter(drasiId: string, characterId: string) {
    const found = await this.prisma.drasiCharacter.findFirst({
      where: { id: characterId, drasiId },
      select: { id: true, participant: { select: { userId: true } } },
    });
    if (!found) throw new NotFoundException('Ο ρόλος δεν βρέθηκε.');
    return found;
  }

  /** Τον ρόλο τον παίζει στέλεχος **αυτής** της δράσης — όχι παιδί, όχι κάποιος που δεν έρχεται. */
  private async assertStelexos(drasiId: string, participantId: string): Promise<void> {
    const p = await this.prisma.drasiParticipant.findFirst({ where: { id: participantId, drasiId }, select: { kind: true } });
    if (!p) throw new BadRequestException('Το στέλεχος δεν συμμετέχει στη δράση.');
    if (p.kind !== MemberKind.STELEXOS) throw new BadRequestException('Τους ρόλους του μύθου τους παίζουν στελέχη.');
  }

  private cleanName(raw: string): string {
    const name = raw.trim();
    if (!name) throw new BadRequestException('Ο ρόλος θέλει όνομα.');
    return name;
  }
}

type StelexosRow = { id: string; user: { id: string; firstName: string; lastName: string } };

function toStelexos(p: StelexosRow): DrasiMythosStelexos {
  return { participantId: p.id, userId: p.user.id, firstName: p.user.firstName, lastName: p.user.lastName };
}

function toCharacter(c: { id: string; name: string; lore: string | null; order: number; participant: StelexosRow | null }): DrasiCharacterView {
  return { id: c.id, name: c.name, lore: c.lore, order: c.order, stelexos: c.participant ? toStelexos(c.participant) : null };
}
