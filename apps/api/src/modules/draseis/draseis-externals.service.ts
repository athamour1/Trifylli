import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccountRole, DrasiFeeKind, MemberKind } from '@prisma/client';
import type { DrasiExternalCreated, DrasiExternalView, DrasiRoleKind } from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { RequestUser } from '../../common/auth/types';
import { AuthentikClient } from '../integrations/authentik.client';
import { DrasiAccessService } from './drasi-access.service';
import type { CreateDrasiExternalDto } from './dto/drasi-externals.dto';

/**
 * Μαρκάρει τους εξωτερικούς ως «φιλοξενούμενους»: έτσι μένουν εκτός μητρώου,
 * συνδρομών και προόδου, όπως κάθε μέλος άλλου Τοπικού (τα ερωτήματα εκεί
 * φιλτράρουν `guestTopikoCode: null`).
 */
const EXTERNAL_MARK = 'EXT';

/**
 * Εξωτερικά στελέχη μιας δράσης: άτομα που δεν είναι στο e-SEO του Τοπικού
 * (π.χ. από άλλο Τοπικό) και χρειάζονται την εφαρμογή για τη διάρκεια της
 * δράσης. Τα προσθέτει ο αρχηγός της· παίρνουν λογαριασμό `EXTERNAL`, μπαίνουν
 * ως στελέχη στους συμμετέχοντες, και ο ρόλος τους ορίζεται από το αρχηγείο.
 * Η πρόσβαση λήγει μόνη της με το κλείσιμο της δράσης.
 */
@Injectable()
export class DraseisExternalsService {
  private readonly logger = new Logger(DraseisExternalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: DrasiAccessService,
    private readonly authentik: AuthentikClient,
  ) {}

  async list(user: RequestUser, id: string): Promise<DrasiExternalView[]> {
    await this.access.load(user, id, 'read');
    const rows = await this.prisma.drasiParticipant.findMany({
      where: { drasiId: id, user: { accountRole: AccountRole.EXTERNAL } },
      select: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            guestTopikoName: true,
            ssoId: true,
            drasiRoles: { where: { drasiId: id }, select: { kind: true } },
          },
        },
      },
      orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
    });
    return rows.map((r) => toView(r.user));
  }

  async create(user: RequestUser, id: string, dto: CreateDrasiExternalDto): Promise<DrasiExternalCreated> {
    await this.access.load(user, id, 'write');
    const email = dto.email.trim().toLowerCase();

    let person = await this.prisma.user.findFirst({ where: { topikoId: user.topikoId, email } });
    if (person && person.accountRole !== AccountRole.EXTERNAL) {
      throw new BadRequestException(
        'Το email ανήκει ήδη σε άτομο του μητρώου — βάλε το άτομο στο αρχηγείο ή στους συμμετέχοντες, όχι ως εξωτερικό.',
      );
    }
    if (!person) {
      person = await this.prisma.user.create({
        data: {
          topikoId: user.topikoId,
          email,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          phone: dto.phone?.trim() || null,
          kind: MemberKind.STELEXOS,
          accountRole: AccountRole.EXTERNAL,
          guestTopikoCode: EXTERNAL_MARK,
          guestTopikoName: dto.origin?.trim() || 'Εξωτερικό στέλεχος',
        },
      });
    }

    // Στέλεχος στους συμμετέχοντες ⇒ βλέπει τη δράση· ο ρόλος του από το αρχηγείο.
    await this.prisma.drasiParticipant.upsert({
      where: { drasiId_userId: { drasiId: id, userId: person.id } },
      create: { drasiId: id, userId: person.id, kind: MemberKind.STELEXOS, feeKind: DrasiFeeKind.STELEXOS },
      update: { kind: MemberKind.STELEXOS },
    });

    const external = (await this.list(user, id)).find((e) => e.userId === person.id)!;
    try {
      await this.sendInvite(person);
      return { external, invited: true, inviteError: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Το εξωτερικό στέλεχος ${person.id} προστέθηκε αλλά η πρόσκληση απέτυχε: ${message}`);
      return { external, invited: false, inviteError: message };
    }
  }

  async invite(user: RequestUser, id: string, userId: string): Promise<{ sent: true }> {
    await this.access.load(user, id, 'write');
    const person = await this.external(id, userId);
    await this.sendInvite(person);
    return { sent: true };
  }

  /** Βγαίνει από τη δράση (ρόλοι + συμμετοχή). Χωρίς άλλη ανοιχτή δράση, δεν μπαίνει πια. */
  async remove(user: RequestUser, id: string, userId: string): Promise<{ removed: true }> {
    await this.access.load(user, id, 'write');
    await this.external(id, userId);
    const payments = await this.prisma.drasiPayment.count({ where: { participant: { drasiId: id, userId } } });
    if (payments) throw new BadRequestException('Έχει πληρωμές στη δράση — σβήσε τες πρώτα από τους συμμετέχοντες.');
    await this.prisma.$transaction([
      this.prisma.drasiRole.deleteMany({ where: { drasiId: id, userId } }),
      this.prisma.drasiParticipant.deleteMany({ where: { drasiId: id, userId } }),
    ]);
    return { removed: true };
  }

  private async external(drasiId: string, userId: string) {
    const person = await this.prisma.user.findFirst({
      where: { id: userId, accountRole: AccountRole.EXTERNAL, participations: { some: { drasiId } } },
    });
    if (!person) throw new NotFoundException('Το εξωτερικό στέλεχος δεν βρέθηκε σε αυτή τη δράση.');
    return person;
  }

  private async sendInvite(person: { id: string; email: string | null; firstName: string; lastName: string }): Promise<void> {
    if (!person.email) throw new BadRequestException('Δεν υπάρχει email.');
    if (!this.authentik.configured) throw new BadRequestException('Δεν έχει ρυθμιστεί το Authentik — δεν φεύγει πρόσκληση.');
    await this.authentik.sendPasswordSetupEmail({
      accountId: person.id,
      email: person.email,
      firstName: person.firstName,
      lastName: person.lastName,
    });
  }
}

function toView(u: {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  guestTopikoName: string | null;
  ssoId: string | null;
  drasiRoles: { kind: string }[];
}): DrasiExternalView {
  return {
    userId: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phone: u.phone,
    origin: u.guestTopikoName,
    active: !!u.ssoId,
    roles: u.drasiRoles.map((r) => r.kind as DrasiRoleKind),
  };
}
