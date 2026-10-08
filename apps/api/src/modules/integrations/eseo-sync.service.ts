import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, MemberKind, MemberStatus, Prisma, SyndromiStatus } from '@prisma/client';
import { deriveLeaderProfile } from '@trifylli/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AppConfigToken } from '../../common/config/config.module';
import type { AppConfig } from '../../common/config/configuration';
import { eseoTypeToIdiotita, eseoTypeToMemberKind, isKnownEseoType, mapEseoTypeToKlados } from './member-type';
import { EseoClient, type NormalizedEseoMember } from './eseo.client';

export interface SyncSummary {
  created: number;
  updated: number;
  skipped: number;
  deactivated: number;
  /** Πτυχία στελεχών που συγχρονίστηκαν. */
  licenses: number;
  /** Τύποι μέλους που δεν αναγνωρίζουμε (πιθανή προσθήκη από πλευρά e-SEO). */
  unmappedTypes: string[];
}

/**
 * Sync engine μητρώου από e-SEO.
 *
 * Αρχές:
 *  * **Το e-SEO είναι η πηγή αλήθειας για τα στοιχεία ταυτότητας** (όνομα,
 *    επικοινωνία, ημ. γέννησης, κατάσταση). Η πρόσβαση στην εφαρμογή **δεν**
 *    έρχεται από εκεί: τους λογαριασμούς τους ορίζει ο υπερδιαχειριστής και ο
 *    συγχρονισμός δεν αγγίζει ποτέ το `accountRole`.
 *  * **Τοπικές αλλαγές δεν χάνονται**: ο κλάδος/υποομάδα (`Membership`) τίθεται
 *    μόνο όταν το μέλος δεν έχει ήδη τοποθέτηση — το e-SEO δεν ξέρει ποιος
 *    ανήκει σε ποια εξάδα.
 *  * **Idempotent**: κλειδί το `eseoId`, οπότε επανεκτέλεση δεν διπλασιάζει.
 */
@Injectable()
export class EseoSyncService {
  private readonly logger = new Logger(EseoSyncService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eseo: EseoClient,
    @Inject(AppConfigToken) private readonly config: AppConfig,
  ) {}

  /**
   * Περιοδικός συγχρονισμός. Το cron expression ορίζεται στο `ESEO_SYNC_CRON`
   * αλλά ο διακοσμητής απαιτεί σταθερά, οπότε εδώ τρέχει καθημερινά στις 04:00
   * και ο έλεγχος `SYNC_ENABLED` γίνεται μέσα στη μέθοδο.
   */
  @Cron('0 4 * * *', { name: 'eseo-sync', timeZone: 'Europe/Athens' })
  async scheduledSync(): Promise<void> {
    if (!this.config.SYNC_ENABLED || !this.eseo.configured) return;

    const topika = await this.prisma.topiko.findMany({
      where: { eseoCode: { not: null } },
      select: { id: true, eseoCode: true, name: true },
    });

    for (const topiko of topika) {
      try {
        const summary = await this.syncTopiko(topiko.id);
        this.logger.log(
          `Συγχρονισμός ${topiko.name}: +${summary.created} νέα, ${summary.updated} ενημερώσεις, ` +
            `${summary.deactivated} απενεργοποιήσεις.`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Αποτυχία συγχρονισμού ${topiko.name}: ${message}`);
      }
    }
  }

  /**
   * Συγχρονισμός «όταν μπορείς»: αν τρέχει ήδη, σημειώνει ότι χρειάζεται ένα
   * ακόμη πέρασμα μόλις τελειώσει, αντί να αποτύχει ή να στοιβάξει δεύτερο.
   * Για το webhook: δέκα ειδοποιήσεις στη σειρά = ένας sync τώρα + ένας μετά.
   */
  async requestSync(topikoId: string): Promise<void> {
    if (this.running) {
      this.rerunRequested.add(topikoId);
      return;
    }
    await this.syncTopiko(topikoId);
    if (this.rerunRequested.delete(topikoId)) {
      this.logger.log('Ήρθαν νέες ειδοποιήσεις όσο έτρεχε ο συγχρονισμός — τρέχει ξανά.');
      await this.syncTopiko(topikoId);
    }
  }

  private readonly rerunRequested = new Set<string>();

  /** Χειροκίνητος συγχρονισμός ενός Τοπικού. */
  async syncTopiko(topikoId: string): Promise<SyncSummary> {
    // Ο συγχρονισμός γράφει σε όλο το μητρώο· δύο ταυτόχρονες εκτελέσεις
    // (cron + χειροκίνητη) θα πάλευαν για τις ίδιες εγγραφές.
    if (this.running) {
      throw new Error('Ο συγχρονισμός e-SEO εκτελείται ήδη.');
    }
    this.running = true;

    const topiko = await this.prisma.topiko.findUniqueOrThrow({
      where: { id: topikoId },
      select: { id: true, eseoCode: true },
    });
    if (!topiko.eseoCode) {
      this.running = false;
      throw new Error('Το Τοπικό δεν έχει κωδικό e-SEO.');
    }

    const run = await this.prisma.syncRun.create({
      data: { topikoId, source: DataSource.ESEO },
    });

    const summary: SyncSummary = {
      created: 0,
      updated: 0,
      skipped: 0,
      deactivated: 0,
      licenses: 0,
      unmappedTypes: [],
    };
    const seen = new Set<string>();

    try {
      const kladoi = await this.prisma.klados.findMany({
        where: { topikoId },
        select: { id: true, type: true },
      });
      const kladosIdByType = new Map(kladoi.map((k) => [k.type, k.id]));
      // Ποσά συνδρομής ανά τύπο μέλους (μέθοδος «ΑΠΟΓΡΑΦΗ»). Μία φορά ανά εκτέλεση.
      const billing = await this.eseo.billingAmounts();

      for await (const page of this.eseo.members(topiko.eseoCode)) {
        for (const member of page) {
          const result = await this.upsertMember(topikoId, member, kladosIdByType, billing);
          seen.add(member.eseoId);

          if (result === 'created') summary.created += 1;
          else if (result === 'updated') summary.updated += 1;
          else summary.skipped += 1;

          if (member.type && !isKnownEseoType(member.type)) {
            if (!summary.unmappedTypes.includes(member.type)) {
              summary.unmappedTypes.push(member.type);
            }
          }
        }
      }

      // Μέλη που έφυγαν από το e-SEO: σημαίνονται ανενεργά, δεν διαγράφονται —
      // τα παρουσιολόγια και οι συνδρομές τους πρέπει να παραμείνουν.
      const deactivated = await this.prisma.user.updateMany({
        where: {
          topikoId,
          source: DataSource.ESEO,
          status: MemberStatus.ENERGO,
          eseoId: { notIn: [...seen] },
        },
        data: { status: MemberStatus.ANENERGO },
      });
      summary.deactivated = deactivated.count;

      // Πτυχία στελεχών — ξεχωριστό πέρασμα, αφού δένουν σε υπάρχοντα μέλη.
      summary.licenses = await this.syncLicenses(topikoId, topiko.eseoCode);

      // Τοποθέτηση στελεχών στον κλάδο τους από τα ενεργά πτυχία (Αρχηγός/
      // Υπαρχηγός/Βοηθός Ομάδας/Σμήνους/Γαλαξία…), ώστε να εμφανίζονται και στον κλάδο.
      await this.placeLeadersByLicenses(topikoId, kladosIdByType);

      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          finishedAt: new Date(),
          ok: true,
          created: summary.created,
          updated: summary.updated,
          skipped: summary.skipped,
        },
      });

      if (summary.unmappedTypes.length > 0) {
        this.logger.warn(
          `Άγνωστοι τύποι μέλους e-SEO: ${summary.unmappedTypes.join(', ')} — ` +
            'τα μέλη συγχρονίστηκαν χωρίς τοποθέτηση σε κλάδο.',
        );
      }

      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: { finishedAt: new Date(), ok: false, error: message },
      });
      throw error;
    } finally {
      this.running = false;
    }
  }

  private async upsertMember(
    topikoId: string,
    member: NormalizedEseoMember,
    kladosIdByType: Map<string, string>,
    billing: Map<string, number>,
  ): Promise<'created' | 'updated' | 'skipped'> {
    if (!member.firstName && !member.lastName) return 'skipped';

    let existing = await this.prisma.user.findUnique({
      where: { eseoId: member.eseoId },
      select: { id: true, topikoId: true, memberships: { select: { id: true } } },
    });

    // Λογαριασμός που φτιάχτηκε πριν από τον συγχρονισμό (π.χ. ο υπερδιαχειριστής
    // στην πρώτη σύνδεση) με το ίδιο email: είναι το ίδιο πρόσωπο — τον δένουμε
    // με την εγγραφή του e-SEO αντί να φτιάξουμε δεύτερο άτομο.
    if (!existing && member.email) {
      const account = await this.prisma.user.findFirst({
        where: { topikoId, email: { equals: member.email, mode: 'insensitive' }, eseoId: null },
        select: { id: true },
      });
      if (account) {
        existing = await this.prisma.user.update({
          where: { id: account.id },
          data: { eseoId: member.eseoId },
          select: { id: true, topikoId: true, memberships: { select: { id: true } } },
        });
      }
    }

    // Μέλος που ανήκει σε άλλο Τοπικό δεν μεταφέρεται σιωπηλά.
    if (existing && existing.topikoId !== topikoId) return 'skipped';

    const kind = eseoTypeToMemberKind(member.type);

    // Το e-SEO επιτρέπει κοινό email (αδέλφια, email γονέα), αλλά το Trifylli
    // έχει `@@unique([topikoId, email])` γιατί το email δένει λογαριασμούς. Για
    // τα μέλη μητρώου κρατάμε το email μόνο στο πρώτο άτομο που το φέρει· στα
    // υπόλοιπα μένει κενό — η πλήρης τιμή σώζεται στο `eseoPayload`.
    let email = member.email ?? null;
    if (email) {
      const clash = await this.prisma.user.findFirst({
        // Το `not` σκέτο αφήνει έξω τα NULL — χωρίς το OR ένας λογαριασμός χωρίς
        // eseoId δεν μετράει ως σύγκρουση και το upsert σκάει στο unique.
        where: { topikoId, email, OR: [{ eseoId: null }, { eseoId: { not: member.eseoId } }] },
        select: { id: true },
      });
      if (clash) email = null;
    }

    const data = {
      firstName: member.firstName || '—',
      lastName: member.lastName || '—',
      email,
      phone: member.phone,
      birthDate: member.birthDate,
      sex: member.sex,
      street: member.street,
      postalCode: member.postalCode,
      city: member.city,
      area: member.area,
      // Το e-SEO είναι η πηγή αλήθειας για την ταυτότητα — ενημερώνουμε το `kind`
      // κάθε φορά (π.χ. παιδί που έγινε στέλεχος), ποτέ όμως το `accountRole`.
      kind,
      idiotita: eseoTypeToIdiotita(member.type),
      status: member.active ? MemberStatus.ENERGO : MemberStatus.ANENERGO,
      source: DataSource.ESEO,
      eseoPayload: member.raw as Prisma.InputJsonValue,
      lastSyncedAt: new Date(),
    };

    const user = await this.prisma.user.upsert({
      where: { eseoId: member.eseoId },
      create: { topikoId, eseoId: member.eseoId, ...data },
      update: data,
      select: { id: true },
    });

    // Τοποθέτηση σε κλάδο μόνο για μέλη που δεν έχουν καμία: το e-SEO δεν ξέρει
    // υποομάδες και μια επανατοποθέτηση θα έσβηνε δουλειά των στελεχών.
    const klados = mapEseoTypeToKlados(member.type);
    if (klados && (!existing || existing.memberships.length === 0)) {
      const kladosId = kladosIdByType.get(klados);
      if (kladosId) {
        await this.prisma.membership.upsert({
          where: { userId_kladosId: { userId: user.id, kladosId } },
          create: { userId: user.id, kladosId, kind },
          update: {},
        });
      }
    }

    await this.syncGuardians(user.id, member);
    await this.syncSubscription(topikoId, user.id, member, billing);

    return existing ? 'updated' : 'created';
  }

  /** Κηδεμόνες από το e-SEO — idempotent ανά `eseoId` επαφής. */
  /**
   * Τοποθετεί κάθε στέλεχος στον κλάδο που δείχνει το ενεργό ρόλος-πτυχίο του.
   * Δεν πειράζει memberships που υπάρχουν ήδη (π.χ. υποομάδα που όρισαν χειροκίνητα).
   */
  private async placeLeadersByLicenses(
    topikoId: string,
    kladosIdByType: Map<string, string>,
  ): Promise<void> {
    const leaders = await this.prisma.user.findMany({
      where: { topikoId, archivedAt: null, licenses: { some: { status: 'ACTIVE' } } },
      select: {
        id: true,
        licenses: { where: { status: 'ACTIVE' }, select: { title: true, status: true } },
      },
    });

    for (const leader of leaders) {
      const profile = deriveLeaderProfile(leader.licenses);
      for (const role of profile.kladosRoles) {
        const kladosId = kladosIdByType.get(role.kladosType);
        if (!kladosId) continue;
        await this.prisma.membership.upsert({
          where: { userId_kladosId: { userId: leader.id, kladosId } },
          create: { userId: leader.id, kladosId, kind: MemberKind.STELEXOS },
          update: {},
        });
      }
    }
  }

  private async syncGuardians(userId: string, member: NormalizedEseoMember): Promise<void> {
    for (const g of member.guardians) {
      // Κενή επαφή (μόνο id, χωρίς στοιχεία) δεν αξίζει εγγραφή.
      if (!g.fullName && !g.phone && !g.email) continue;

      await this.prisma.guardian.upsert({
        where: { eseoId: g.eseoId },
        create: {
          userId,
          eseoId: g.eseoId,
          kind: g.kind,
          fullName: g.fullName,
          phone: g.phone,
          email: g.email,
        },
        update: { userId, kind: g.kind, fullName: g.fullName, phone: g.phone, email: g.email },
      });
    }
  }

  /**
   * Συγχρονίζει τα πτυχία (ACTIVE + EXPIRED) και τα δένει σε υπάρχοντα μέλη.
   * Πτυχίο μέλους που δεν έχουμε (π.χ. ανενεργό, εκτός ενεργού μητρώου)
   * προσπερνιέται. Επιστρέφει πόσα δέθηκαν.
   */
  private async syncLicenses(topikoId: string, eseoCode: string): Promise<number> {
    let count = 0;
    for await (const page of this.eseo.licenses(eseoCode)) {
      for (const lic of page) {
        if (!lic.memberEseoId) continue;
        const user = await this.prisma.user.findFirst({
          where: { eseoId: lic.memberEseoId, topikoId },
          select: { id: true },
        });
        if (!user) continue;

        await this.prisma.license.upsert({
          where: { eseoId: lic.eseoId },
          create: {
            userId: user.id,
            eseoId: lic.eseoId,
            title: lic.title,
            status: lic.status,
            startDate: lic.startDate,
            expirationDate: lic.expirationDate,
            source: DataSource.ESEO,
            lastSyncedAt: new Date(),
          },
          update: {
            userId: user.id,
            title: lic.title,
            status: lic.status,
            startDate: lic.startDate,
            expirationDate: lic.expirationDate,
            lastSyncedAt: new Date(),
          },
        });
        count += 1;
      }
    }
    return count;
  }

  /**
   * Η συνδρομή καταγράφεται ως **ένδειξη** στην τρέχουσα περίοδο.
   *
   * Το e-SEO δεν εκθέτει ρητά «πληρωμένη συνδρομή» στο μέλος· η πιο κοντινή
   * ένδειξη είναι η **απογραφή** τρέχοντος έτους (`isCensused`), που στο Σ.Ε.Ο.
   * προϋποθέτει καταβολή της συνδρομής. Το οφειλόμενο ποσό προτιμά το
   * `censusValue` του μέλους, μετά το ποσό της μεθόδου «ΑΠΟΓΡΑΦΗ» ανά τύπο, και
   * τέλος το ποσό της περιόδου. Οι πληρωμές που έχουν καταχωρηθεί **τοπικά δεν
   * πειράζονται**: το Τοπικό έχει αποδείξεις, το e-SEO μπορεί να καθυστερεί.
   */
  private async syncSubscription(
    topikoId: string,
    userId: string,
    member: NormalizedEseoMember,
    billing: Map<string, number>,
  ): Promise<void> {
    // Δεν ανοίγουμε οφειλές σε διαγραμμένα/ανενεργά μέλη.
    if (!member.active) return;

    const period = await this.prisma.period.findFirst({
      where: { topikoId, isCurrent: true },
      select: { id: true, syndromiAmount: true },
    });
    if (!period) return;

    const existing = await this.prisma.syndromi.findUnique({
      where: { userId_periodId: { userId, periodId: period.id } },
      select: { id: true, amountPaid: true },
    });

    // Υπάρχει τοπική πληρωμή ⇒ δεν την αντικαθιστούμε.
    if (existing && Number(existing.amountPaid) > 0) return;

    const paid = member.isCensused === true;
    const byType = member.type ? billing.get(member.type.toUpperCase()) : undefined;
    const amountDue = new Prisma.Decimal(
      member.censusValue ?? byType ?? Number(period.syndromiAmount),
    );
    const amountPaid = paid ? amountDue : new Prisma.Decimal(0);
    const status = paid ? SyndromiStatus.PLIROMENI : SyndromiStatus.EKKREMI;

    await this.prisma.syndromi.upsert({
      where: { userId_periodId: { userId, periodId: period.id } },
      create: {
        userId,
        periodId: period.id,
        amountDue,
        amountPaid,
        status,
        source: DataSource.ESEO,
        note: 'Από e-SEO (απογραφή)',
      },
      update: { amountDue, amountPaid, status },
    });
  }
}
