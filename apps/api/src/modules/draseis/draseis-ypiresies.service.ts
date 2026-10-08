import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DrasiGroupKind, Prisma } from '@prisma/client';
import {
  DRASI_ROLE_LABEL,
  DRASI_YPIRESIA_KINDS,
  YpiresiesRotation,
  type DrasiRoleKind,
  type DrasiYpiresiaView,
  type DrasiYpiresiesView,
  type KladosType,
} from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { DrasiAccessService } from './drasi-access.service';
import { DraseisPlanService, localDate } from './draseis-plan.service';
import type { CreateYpiresiaDto, SetResponsiblesDto, SetYpiresiaSlotsDto, SetYpiresiesSettingsDto, UpdateYpiresiaDto } from './dto/drasi-ypiresies.dto';

/** Ποιες ομάδες κάνουν υπηρεσίες: οι υποομάδες των κλάδων και οι ΟΕ (όχι σκηνές/επιτροπές). */
const SERVICE_GROUP_KINDS: DrasiGroupKind[] = [DrasiGroupKind.PENTADA, DrasiGroupKind.FOLIA, DrasiGroupKind.ENOMOTIA, DrasiGroupKind.OE];

const responsibleSelect = { user: { select: { id: true, firstName: true, lastName: true, phone: true } } } as const;

/**
 * Οι υπηρεσίες μιας δράσης: ποιες ισχύουν (προκαθορισμένες + πρόσθετες), ποιος
 * είναι υπεύθυνος, και το χρονοδιάγραμμα — ποια ομάδα έχει ποια υπηρεσία σε
 * κάθε βάρδια. Βάρδια = η μονάδα της κύλισης: όλη η δράση (σταθερές), μία μέρα,
 * ή μισή μέρα (δύο φορές τη μέρα).
 */
@Injectable()
export class DraseisYpiresiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DrasiAccessService,
    private readonly plan: DraseisPlanService,
  ) {}

  async view(user: RequestUser, id: string): Promise<DrasiYpiresiesView> {
    const drasi = await this.access.load(user, id, 'read');
    const tz = await this.plan.timezone(user);
    const [services, groups, slots] = await Promise.all([
      this.services(id),
      this.prisma.drasiGroup.findMany({
        where: { drasiId: id, kind: { in: SERVICE_GROUP_KINDS } },
        orderBy: [{ kind: 'asc' }, { order: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, kind: true, klados: { select: { type: true } } },
      }),
      this.prisma.drasiYpiresiaSlot.findMany({ where: { drasiId: id }, select: { date: true, half: true, groupId: true, ypiresiaId: true } }),
    ]);
    const shifts = shiftsOf(drasi, drasi.ypiresiesRotation as YpiresiesRotation, tz);
    const valid = new Set(shifts.map((s) => `${s.date}:${s.half}`));
    return {
      rotation: drasi.ypiresiesRotation as YpiresiesRotation,
      services,
      groups: groups.map((g) => ({ id: g.id, name: g.name, kind: g.kind, kladosType: (g.klados?.type as KladosType | undefined) ?? null })),
      shifts,
      slots: slots
        .map((s) => ({ date: s.date.toISOString().slice(0, 10), half: s.half, groupId: s.groupId, ypiresiaId: s.ypiresiaId }))
        .filter((s) => valid.has(`${s.date}:${s.half}`)),
    };
  }

  /** Αλλαγή κύλισης: οι βάρδιες αλλάζουν σχήμα, οπότε το χρονοδιάγραμμα ξεκινά από την αρχή. */
  async setSettings(user: RequestUser, id: string, dto: SetYpiresiesSettingsDto): Promise<DrasiYpiresiesView> {
    const drasi = await this.access.load(user, id, 'write');
    if (drasi.ypiresiesRotation !== dto.rotation) {
      await this.prisma.$transaction([
        this.prisma.drasi.update({ where: { id }, data: { ypiresiesRotation: dto.rotation } }),
        this.prisma.drasiYpiresiaSlot.deleteMany({ where: { drasiId: id } }),
      ]);
    }
    return this.view(user, id);
  }

  async create(user: RequestUser, id: string, dto: CreateYpiresiaDto): Promise<DrasiYpiresiaView[]> {
    await this.access.load(user, id, 'write');
    if (dto.kind && !DRASI_YPIRESIA_KINDS.includes(dto.kind)) throw new BadRequestException('Δεν είναι υπηρεσία.');
    const name = dto.kind ? DRASI_ROLE_LABEL[dto.kind] : dto.name?.trim();
    if (!name) throw new BadRequestException('Η υπηρεσία θέλει όνομα.');
    const last = await this.prisma.drasiYpiresia.aggregate({ where: { drasiId: id }, _max: { order: true } });
    try {
      await this.prisma.drasiYpiresia.create({
        data: { drasiId: id, name, kind: dto.kind ?? null, order: (last._max.order ?? -1) + 1 },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException(`Υπάρχει ήδη υπηρεσία «${name}».`);
      }
      throw error;
    }
    return this.services(id);
  }

  async update(user: RequestUser, id: string, serviceId: string, dto: UpdateYpiresiaDto): Promise<DrasiYpiresiaView[]> {
    await this.access.load(user, id, 'write');
    await this.find(id, serviceId);
    if (dto.name) await this.prisma.drasiYpiresia.update({ where: { id: serviceId }, data: { name: dto.name.trim() } });
    return this.services(id);
  }

  /** Απενεργοποίηση: φεύγει η υπηρεσία, οι υπεύθυνοι και οι βάρδιές της. */
  async remove(user: RequestUser, id: string, serviceId: string): Promise<DrasiYpiresiaView[]> {
    await this.access.load(user, id, 'write');
    await this.find(id, serviceId);
    await this.prisma.drasiYpiresia.delete({ where: { id: serviceId } });
    return this.services(id);
  }

  async setResponsibles(user: RequestUser, id: string, serviceId: string, dto: SetResponsiblesDto): Promise<DrasiYpiresiaView[]> {
    await this.access.load(user, id, 'write');
    await this.find(id, serviceId);
    const ids = [...new Set(dto.userIds)];
    const known = await this.prisma.user.count({ where: { id: { in: ids }, topikoId: user.topikoId, archivedAt: null } });
    if (known !== ids.length) throw new BadRequestException('Άγνωστα στελέχη.');
    await this.prisma.$transaction([
      this.prisma.drasiYpiresiaResponsible.deleteMany({ where: { ypiresiaId: serviceId } }),
      this.prisma.drasiYpiresiaResponsible.createMany({ data: ids.map((userId) => ({ ypiresiaId: serviceId, userId })) }),
    ]);
    return this.services(id);
  }

  /** Αλλαγές κελιών του χρονοδιαγράμματος (`ypiresiaId: null` ⇒ ελεύθερη). */
  async setSlots(user: RequestUser, id: string, dto: SetYpiresiaSlotsDto): Promise<DrasiYpiresiesView> {
    await this.access.load(user, id, 'write');
    const [groups, services] = await Promise.all([
      this.prisma.drasiGroup.findMany({ where: { drasiId: id, kind: { in: SERVICE_GROUP_KINDS } }, select: { id: true } }),
      this.prisma.drasiYpiresia.findMany({ where: { drasiId: id }, select: { id: true } }),
    ]);
    const groupIds = new Set(groups.map((g) => g.id));
    const serviceIds = new Set(services.map((s) => s.id));
    for (const slot of dto.slots) {
      if (!groupIds.has(slot.groupId)) throw new BadRequestException('Άγνωστη ομάδα.');
      if (slot.ypiresiaId && !serviceIds.has(slot.ypiresiaId)) throw new BadRequestException('Άγνωστη υπηρεσία.');
    }
    await this.prisma.$transaction(
      dto.slots.map((slot) => {
        const key = { drasiId_date_half_groupId: { drasiId: id, date: new Date(`${slot.date}T00:00:00Z`), half: slot.half, groupId: slot.groupId } };
        return slot.ypiresiaId
          ? this.prisma.drasiYpiresiaSlot.upsert({
              where: key,
              create: { drasiId: id, date: new Date(`${slot.date}T00:00:00Z`), half: slot.half, groupId: slot.groupId, ypiresiaId: slot.ypiresiaId },
              update: { ypiresiaId: slot.ypiresiaId },
            })
          : this.prisma.drasiYpiresiaSlot.deleteMany({ where: key.drasiId_date_half_groupId });
      }),
    );
    return this.view(user, id);
  }

  /**
   * Κυκλική κατανομή: σε κάθε βάρδια κάθε ομάδα πάει στην επόμενη υπηρεσία.
   * Με περισσότερες ομάδες από υπηρεσίες, μένουν ελεύθερες εκ περιτροπής· με
   * λιγότερες, κάποια υπηρεσία μένει ακάλυπτη σε κάθε βάρδια (εκ περιτροπής κι αυτή).
   * Αντικαθιστά ό,τι υπήρχε.
   */
  async rotate(user: RequestUser, id: string): Promise<DrasiYpiresiesView> {
    const drasi = await this.access.load(user, id, 'write');
    const tz = await this.plan.timezone(user);
    const [groups, services] = await Promise.all([
      this.prisma.drasiGroup.findMany({
        where: { drasiId: id, kind: { in: SERVICE_GROUP_KINDS } },
        orderBy: [{ kind: 'asc' }, { order: 'asc' }, { name: 'asc' }],
        select: { id: true },
      }),
      this.prisma.drasiYpiresia.findMany({ where: { drasiId: id }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }], select: { id: true } }),
    ]);
    if (!groups.length) throw new BadRequestException('Δεν υπάρχουν ομάδες (ενωμοτίες, φωλιές, πεντάδες ή ΟΕ) για να πάρουν υπηρεσίες.');
    if (!services.length) throw new BadRequestException('Δεν υπάρχουν υπηρεσίες — ενεργοποίησε από τις Ρυθμίσεις.');

    const shifts = shiftsOf(drasi, drasi.ypiresiesRotation as YpiresiesRotation, tz);
    const wheel = Math.max(groups.length, services.length);
    const data: Prisma.DrasiYpiresiaSlotCreateManyInput[] = [];
    shifts.forEach((shift, t) => {
      groups.forEach((group, i) => {
        const k = (i + t) % wheel;
        const service = services[k];
        if (service) data.push({ drasiId: id, date: new Date(`${shift.date}T00:00:00Z`), half: shift.half, groupId: group.id, ypiresiaId: service.id });
      });
    });
    await this.prisma.$transaction([
      this.prisma.drasiYpiresiaSlot.deleteMany({ where: { drasiId: id } }),
      this.prisma.drasiYpiresiaSlot.createMany({ data }),
    ]);
    return this.view(user, id);
  }

  /** Για ντοσιέ/επισκόπηση: οι υπηρεσίες με τους υπευθύνους τους. */
  services(drasiId: string): Promise<DrasiYpiresiaView[]> {
    return this.prisma.drasiYpiresia
      .findMany({
        where: { drasiId },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        include: { responsibles: { include: responsibleSelect, orderBy: { user: { lastName: 'asc' } } } },
      })
      .then((rows) =>
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          kind: (r.kind as DrasiRoleKind | null) ?? null,
          order: r.order,
          responsibles: r.responsibles.map((x) => x.user),
        })),
      );
  }

  private async find(drasiId: string, serviceId: string): Promise<void> {
    const found = await this.prisma.drasiYpiresia.findFirst({ where: { id: serviceId, drasiId }, select: { id: true } });
    if (!found) throw new NotFoundException('Η υπηρεσία δεν βρέθηκε.');
  }
}

/** Οι βάρδιες της δράσης κατά την κύλιση. */
export function shiftsOf(drasi: { dateStart: Date; dateEnd: Date }, rotation: YpiresiesRotation, tz: string): { date: string; half: number }[] {
  const first = localDate(drasi.dateStart, tz);
  if (rotation === YpiresiesRotation.NONE) return [{ date: first, half: 0 }];
  const last = localDate(drasi.dateEnd, tz);
  const shifts: { date: string; half: number }[] = [];
  for (let d = new Date(`${first}T12:00:00Z`); d.toISOString().slice(0, 10) <= last; d = new Date(d.getTime() + 86_400_000)) {
    const date = d.toISOString().slice(0, 10);
    shifts.push({ date, half: 0 });
    if (rotation === YpiresiesRotation.TWICE_DAILY) shifts.push({ date, half: 1 });
  }
  return shifts;
}
