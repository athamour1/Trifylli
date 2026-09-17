/**
 * Seed δεδομένων ανάπτυξης.
 *
 * Στήνει ένα πλήρες Τοπικό: κλάδους, περίοδο, μέλη με ηλικίες μέσα στα όρια
 * κάθε κλάδου, υλικό, δράσεις, συγκεντρώσεις με timeline και παρουσιολόγιο,
 * συμβούλια και συνδρομές. Είναι **idempotent** — τρέχει ξανά χωρίς διπλότυπα.
 *
 *   pnpm db:seed
 */
import {
  AccountRole,
  CheckoutStatus,
  DrasiType,
  MemberKind,
  ParousiaStatus,
  PrismaClient,
  ProodosStatus,
  SymvoulioType,
  SyndromiStatus,
  TimelineSection,
  YlikoCategory,
  type Klados,
  type KladosType,
} from '@prisma/client';
import { KLADOS_LABEL, KLADOS_META, accountRoleLabel } from '@trifylli/shared';

const prisma = new PrismaClient();

/** Σταθερή αφετηρία ώστε τα δεδομένα να είναι ίδια σε κάθε εκτέλεση. */
const SEASON_START = new Date('2026-09-01T00:00:00Z');

const FIRST_NAMES_F = ['Μαρία', 'Ελένη', 'Σοφία', 'Αναστασία', 'Δήμητρα', 'Κατερίνα', 'Ιωάννα', 'Χριστίνα'];
const FIRST_NAMES_M = ['Γιώργος', 'Νίκος', 'Δημήτρης', 'Κώστας', 'Παναγιώτης', 'Ανδρέας', 'Στέφανος', 'Θανάσης'];
const LAST_NAMES = [
  'Παπαδόπουλος', 'Γεωργίου', 'Οικονόμου', 'Νικολάου', 'Αντωνίου', 'Βασιλείου',
  'Δημητρίου', 'Καραγιάννης', 'Μακρής', 'Σταθόπουλος', 'Θεοδώρου', 'Λαμπρόπουλος',
];

async function main(): Promise<void> {
  console.log('→ Τοπικό Τμήμα');
  const topiko = await prisma.topiko.upsert({
    where: { eseoCode: 'TRIFYLLI-01' },
    create: {
      name: 'Τοπικό Τμήμα Τριφυλλίου',
      location: 'Κυπαρισσία',
      eseoCode: 'TRIFYLLI-01',
    },
    update: {},
  });

  console.log('→ Κλάδοι');
  const kladoi = new Map<KladosType, Klados>();
  for (const type of Object.keys(KLADOS_META) as KladosType[]) {
    const meta = KLADOS_META[type];
    const klados = await prisma.klados.upsert({
      where: { topikoId_type: { topikoId: topiko.id, type } },
      create: {
        topikoId: topiko.id,
        type,
        name: `${KLADOS_LABEL[type]} Τριφυλλίου`,
        minAge: meta.minAge,
        maxAge: meta.maxAge,
      },
      update: {},
    });
    kladoi.set(type, klados);
  }

  console.log('→ Οδηγική χρονιά');
  const period = await prisma.period.upsert({
    where: { topikoId_label: { topikoId: topiko.id, label: '2026–2027' } },
    create: {
      topikoId: topiko.id,
      label: '2026–2027',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-06-30'),
      syndromiAmount: 60,
      isCurrent: true,
    },
    update: { isCurrent: true },
  });

  console.log('→ Μέλη και στελέχη');
  let seq = 0;
  const membersByKlados = new Map<KladosType, string[]>();

  for (const [type, klados] of kladoi) {
    const meta = KLADOS_META[type];
    const ids: string[] = [];

    // Δύο ενήλικα στελέχη ανά κλάδο. Το πρώτο θα γίνει και διαχειριστής του
    // κλάδου παρακάτω — ο λογαριασμός δεν είναι νέο άτομο, είναι πρόσβαση.
    for (let index = 0; index < 2; index++) {
      const id = await upsertMember({
        topikoId: topiko.id,
        kladosId: klados.id,
        seq: seq++,
        kind: MemberKind.STELEXOS,
        age: 24 + index * 6,
        subUnit: null,
      });
      ids.push(id);
    }

    // Οκτώ παιδιά, μοιρασμένα σε δύο υποομάδες, με ηλικίες εντός των ορίων.
    const span = Math.max(1, meta.maxAge - meta.minAge);
    for (let i = 0; i < 8; i++) {
      const id = await upsertMember({
        topikoId: topiko.id,
        kladosId: klados.id,
        seq: seq++,
        kind: MemberKind.MELOS,
        age: meta.minAge + (i % span),
        subUnit: `${meta.subUnitLabel} ${i < 4 ? 'Α' : 'Β'}`,
      });
      ids.push(id);
    }

    membersByKlados.set(type, ids);
  }

  console.log('→ Λογαριασμοί');
  await seedAccounts(topiko.id, kladoi, membersByKlados);

  console.log('→ Συνδρομές');
  const allMembers = await prisma.user.findMany({
    where: { topikoId: topiko.id, kind: MemberKind.MELOS },
    select: { id: true },
  });
  for (const [index, member] of allMembers.entries()) {
    // Ένα μοτίβο που παράγει πληρωμένες, μερικές και εκκρεμείς — ώστε οι
    // οικονομικές αναφορές να έχουν κάτι να δείξουν.
    const paid = index % 3 === 0 ? 60 : index % 3 === 1 ? 25 : 0;
    const status =
      paid >= 60 ? SyndromiStatus.PLIROMENI : paid > 0 ? SyndromiStatus.MERIKI : SyndromiStatus.EKKREMI;

    const syndromi = await prisma.syndromi.upsert({
      where: { userId_periodId: { userId: member.id, periodId: period.id } },
      create: { userId: member.id, periodId: period.id, amountDue: 60, amountPaid: paid, status },
      update: { amountPaid: paid, status },
    });

    if (paid > 0) {
      const existing = await prisma.payment.count({ where: { syndromiId: syndromi.id } });
      if (existing === 0) {
        await prisma.payment.create({
          data: { syndromiId: syndromi.id, amount: paid, method: 'Μετρητά', paidAt: SEASON_START },
        });
      }
    }
  }

  console.log('→ Υλικό');
  const yliko = await seedYliko(topiko.id, kladoi);

  console.log('→ Στόχοι προόδου');
  await seedProodosGoals(kladoi);

  console.log('→ Δράσεις');
  const kataskinosi = await upsertDrasi({
    topikoId: topiko.id,
    kladosId: null,
    title: 'Καλοκαιρινή Κατασκήνωση 2027',
    type: DrasiType.KATASKINOSI,
    dateStart: new Date('2027-07-05T08:00:00Z'),
    dateEnd: new Date('2027-07-12T18:00:00Z'),
    location: 'Δασικό Χωριό Ταϋγέτου',
  });

  const ekdromi = await upsertDrasi({
    topikoId: topiko.id,
    kladosId: kladoi.get('ODIGOI')!.id,
    title: 'Μονοήμερη στον Νέδα',
    type: DrasiType.MONOIMERI,
    dateStart: new Date('2026-11-14T08:00:00Z'),
    dateEnd: new Date('2026-11-14T19:00:00Z'),
    location: 'Φαράγγι Νέδα',
  });

  // Συμμετοχές: όλος ο κλάδος Οδηγών στη μονοήμερη, όλοι στην κατασκήνωση.
  for (const [type, ids] of membersByKlados) {
    for (const userId of ids) {
      const member = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { kind: true } });
      await prisma.drasiParticipant.upsert({
        where: { drasiId_userId: { drasiId: kataskinosi.id, userId } },
        create: { drasiId: kataskinosi.id, userId, kind: member.kind, confirmed: true },
        update: {},
      });
      if (type === 'ODIGOI') {
        await prisma.drasiParticipant.upsert({
          where: { drasiId_userId: { drasiId: ekdromi.id, userId } },
          create: { drasiId: ekdromi.id, userId, kind: member.kind, confirmed: true },
          update: {},
        });
      }
    }
  }

  console.log('→ Δεσμεύσεις υλικού');
  const skines = yliko.get('Σκηνές 4 ατόμων')!;
  await upsertCheckout({
    ylikoId: skines,
    kladosId: kladoi.get('ODIGOI')!.id,
    drasiId: kataskinosi.id,
    qty: 4,
    from: new Date('2027-07-04T00:00:00Z'),
    to: new Date('2027-07-13T00:00:00Z'),
    status: CheckoutStatus.DESMEFSI,
  });
  await upsertCheckout({
    ylikoId: skines,
    kladosId: kladoi.get('MEGALOI_ODIGOI')!.id,
    drasiId: kataskinosi.id,
    qty: 3,
    from: new Date('2027-07-04T00:00:00Z'),
    to: new Date('2027-07-13T00:00:00Z'),
    status: CheckoutStatus.DESMEFSI,
  });

  console.log('→ Συγκεντρώσεις, timeline και παρουσιολόγιο');
  await seedSyggentrwseis(kladoi, membersByKlados, yliko);

  console.log('→ Συμβούλια');
  await seedSymvoulia(topiko.id, kladoi, membersByKlados);

  console.log('→ Πρόοδος μελών');
  await seedProodos(kladoi, membersByKlados, period.id);

  const counts = await prisma.$transaction([
    prisma.user.count({ where: { topikoId: topiko.id } }),
    prisma.user.count({ where: { topikoId: topiko.id, accountRole: { not: null } } }),
    prisma.yliko.count({ where: { topikoId: topiko.id } }),
    prisma.drasi.count({ where: { topikoId: topiko.id } }),
    prisma.syggentrwsh.count({ where: { klados: { topikoId: topiko.id } } }),
    prisma.symvoulio.count({ where: { topikoId: topiko.id } }),
    prisma.parousia.count(),
  ]);

  console.log(
    `\n✓ Έτοιμο: ${counts[0]} άτομα (${counts[1]} λογαριασμοί), ${counts[2]} είδη υλικού, ` +
      `${counts[3]} δράσεις, ${counts[4]} συγκεντρώσεις, ${counts[5]} συμβούλια, ${counts[6]} παρουσίες.`,
  );
}

// ───────────────────────────── βοηθητικά ─────────────────────────────

/**
 * Οι πέντε λογαριασμοί: ένας υπερδιαχειριστής και ένας ανά κλάδο.
 *
 * Οι διαχειριστές κλάδων **δεν** είναι νέα άτομα — προάγεται το πρώτο στέλεχος
 * κάθε κλάδου, ακριβώς όπως θα γινόταν στην πράξη. Έτσι το seed δείχνει και τη
 * σωστή σχέση: ο λογαριασμός είναι πρόσβαση πάνω σε υπαρκτό άτομο.
 */
async function seedAccounts(
  topikoId: string,
  kladoi: Map<KladosType, Klados>,
  membersByKlados: Map<KladosType, string[]>,
): Promise<void> {
  await prisma.user.upsert({
    where: { topikoId_email: { topikoId, email: 'admin@trifylli.local' } },
    create: {
      topikoId,
      email: 'admin@trifylli.local',
      firstName: 'Τοπικός',
      lastName: 'Διαχειριστής',
      kind: MemberKind.STELEXOS,
      accountRole: AccountRole.SUPER_ADMIN,
    },
    update: { accountRole: AccountRole.SUPER_ADMIN, adminKladosId: null },
  });

  for (const [type, klados] of kladoi) {
    const stelexosId = membersByKlados.get(type)?.[0];
    if (!stelexosId) continue;

    await prisma.user.update({
      where: { id: stelexosId },
      data: { accountRole: AccountRole.KLADOS_ADMIN, adminKladosId: klados.id },
    });
  }

  const accounts = await prisma.user.findMany({
    where: { topikoId, accountRole: { not: null } },
    include: { adminKlados: { select: { type: true } } },
    orderBy: { accountRole: 'asc' },
  });

  for (const account of accounts) {
    const label = accountRoleLabel(
      account.accountRole!,
      (account.adminKlados?.type as KladosType | undefined) ?? null,
    );
    console.log(`    ${account.email} → ${label}`);
  }
}


async function upsertMember(input: {
  topikoId: string;
  kladosId: string;
  seq: number;
  kind: MemberKind;
  age: number;
  subUnit: string | null;
}): Promise<string> {
  const female = input.seq % 2 === 0;
  const firstName = female
    ? FIRST_NAMES_F[input.seq % FIRST_NAMES_F.length]
    : FIRST_NAMES_M[input.seq % FIRST_NAMES_M.length];
  const lastName = LAST_NAMES[input.seq % LAST_NAMES.length];
  const eseoId = `SEED-${String(input.seq).padStart(4, '0')}`;

  const birthDate = new Date(SEASON_START);
  birthDate.setUTCFullYear(birthDate.getUTCFullYear() - input.age);
  birthDate.setUTCMonth(input.seq % 12);

  const user = await prisma.user.upsert({
    where: { eseoId },
    create: {
      topikoId: input.topikoId,
      eseoId,
      firstName,
      lastName,
      // Μόνο οι ενήλικοι έχουν email: είναι το κλειδί για μελλοντικό λογαριασμό.
      email: input.kind === MemberKind.MELOS ? null : `${eseoId.toLowerCase()}@trifylli.local`,
      birthDate,
      kind: input.kind,
    },
    update: {},
    select: { id: true },
  });

  await prisma.membership.upsert({
    where: { userId_kladosId: { userId: user.id, kladosId: input.kladosId } },
    create: { userId: user.id, kladosId: input.kladosId, kind: input.kind, subUnit: input.subUnit },
    update: { subUnit: input.subUnit },
  });

  return user.id;
}

async function seedYliko(
  topikoId: string,
  kladoi: Map<KladosType, Klados>,
): Promise<Map<string, string>> {
  const items: Array<{
    name: string;
    category: YlikoCategory;
    totalQty: number;
    klados?: KladosType;
    unit?: string;
    consumable?: boolean;
    minQty?: number;
    expiresAt?: Date;
  }> = [
    { name: 'Σκηνές 4 ατόμων', category: YlikoCategory.LEITOURGIKO, totalQty: 8, unit: 'τεμ.' },
    { name: 'Σκηνές 8 ατόμων', category: YlikoCategory.LEITOURGIKO, totalQty: 3, unit: 'τεμ.' },
    { name: 'Γκαζάκια', category: YlikoCategory.LEITOURGIKO, totalQty: 6, unit: 'τεμ.' },
    { name: 'Καζάνια μαγειρικής', category: YlikoCategory.LEITOURGIKO, totalQty: 4, unit: 'τεμ.' },
    { name: 'Σχοινιά', category: YlikoCategory.LEITOURGIKO, totalQty: 20, unit: 'μ.' },
    { name: 'Φακοί κεφαλής', category: YlikoCategory.LEITOURGIKO, totalQty: 15, unit: 'τεμ.' },
    { name: 'Χαρτόνια Α3', category: YlikoCategory.PROGRAMMATIKO, totalQty: 100, unit: 'φύλλα', consumable: true, minQty: 20 },
    { name: 'Μαρκαδόροι', category: YlikoCategory.PROGRAMMATIKO, totalQty: 40, unit: 'τεμ.', consumable: true, minQty: 10 },
    { name: 'Μπογιές', category: YlikoCategory.PROGRAMMATIKO, totalQty: 12, unit: 'σετ', consumable: true, minQty: 3 },
    { name: 'Πυξίδες', category: YlikoCategory.PROGRAMMATIKO, totalQty: 10, unit: 'τεμ.', klados: 'ODIGOI' },
    { name: 'Παιχνίδια συνεργασίας', category: YlikoCategory.PROGRAMMATIKO, totalQty: 6, unit: 'σετ', klados: 'POULIA' },
    {
      name: 'Γάζες αποστειρωμένες',
      category: YlikoCategory.FARMAKEIO,
      totalQty: 30,
      unit: 'τεμ.',
      consumable: true,
      minQty: 10,
      expiresAt: new Date('2027-03-01'),
    },
    {
      name: 'Αντισηπτικό διάλυμα',
      category: YlikoCategory.FARMAKEIO,
      totalQty: 4,
      unit: 'φιάλες',
      consumable: true,
      minQty: 2,
      expiresAt: new Date('2026-12-15'),
    },
  ];

  const result = new Map<string, string>();

  for (const item of items) {
    // Το `externalId` είναι null για τοπικά είδη, οπότε το unique δεν βοηθά:
    // ψάχνουμε πρώτα με όνομα + Τοπικό για να μείνει το seed idempotent.
    const existing = await prisma.yliko.findFirst({
      where: { topikoId, name: item.name },
      select: { id: true },
    });

    const kladosId = item.klados ? kladoi.get(item.klados)!.id : null;

    const row = existing
      ? await prisma.yliko.update({ where: { id: existing.id }, data: { totalQty: item.totalQty } })
      : await prisma.yliko.create({
          data: {
            topikoId,
            kladosId,
            name: item.name,
            category: item.category,
            totalQty: item.totalQty,
            unit: item.unit,
            consumable: item.consumable ?? false,
            minQty: item.minQty,
            expiresAt: item.expiresAt,
            storageLocation: 'Αποθήκη Εστίας',
          },
        });

    result.set(item.name, row.id);
  }

  return result;
}

async function seedProodosGoals(kladoi: Map<KladosType, Klados>): Promise<void> {
  const template = [
    { code: 'Φ1', title: 'Γνωρίζω τη φύση γύρω μου', category: 'Φύση' },
    { code: 'Φ2', title: 'Φροντίζω το περιβάλλον της κατασκήνωσης', category: 'Φύση' },
    { code: 'Σ1', title: 'Συνεργάζομαι στην ομάδα μου', category: 'Σχέσεις' },
    { code: 'Σ2', title: 'Αναλαμβάνω ευθύνη σε δράση', category: 'Σχέσεις' },
    { code: 'Υ1', title: 'Πρώτες βοήθειες — βασικές γνώσεις', category: 'Σώμα & Υγεία' },
    { code: 'Δ1', title: 'Δεξιότητες υπαίθρου (κόμποι, προσανατολισμός)', category: 'Δεξιότητες' },
  ];

  for (const klados of kladoi.values()) {
    for (const [index, goal] of template.entries()) {
      await prisma.proodosGoal.upsert({
        where: { kladosId_code: { kladosId: klados.id, code: goal.code } },
        create: { kladosId: klados.id, ...goal, order: index },
        update: {},
      });
    }
  }
}

async function upsertDrasi(input: {
  topikoId: string;
  kladosId: string | null;
  title: string;
  type: DrasiType;
  dateStart: Date;
  dateEnd: Date;
  location: string;
}) {
  const existing = await prisma.drasi.findFirst({
    where: { topikoId: input.topikoId, title: input.title },
  });
  if (existing) return existing;
  return prisma.drasi.create({ data: input });
}

async function upsertCheckout(input: {
  ylikoId: string;
  kladosId: string;
  drasiId: string;
  qty: number;
  from: Date;
  to: Date;
  status: CheckoutStatus;
}) {
  const existing = await prisma.ylikoCheckout.findFirst({
    where: { ylikoId: input.ylikoId, drasiId: input.drasiId, kladosId: input.kladosId },
  });
  if (existing) return existing;
  return prisma.ylikoCheckout.create({ data: input });
}

async function seedSyggentrwseis(
  kladoi: Map<KladosType, Klados>,
  membersByKlados: Map<KladosType, string[]>,
  yliko: Map<string, string>,
): Promise<void> {
  for (const [type, klados] of kladoi) {
    const members = membersByKlados.get(type) ?? [];

    for (let week = 0; week < 4; week++) {
      const date = new Date(SEASON_START);
      date.setUTCDate(date.getUTCDate() + 7 * week + 6); // Κάθε Κυριακή

      const existing = await prisma.syggentrwsh.findFirst({
        where: { kladosId: klados.id, date },
      });

      const syggentrwsh =
        existing ??
        (await prisma.syggentrwsh.create({
          data: {
            kladosId: klados.id,
            title: `Συγκέντρωση ${week + 1}η`,
            date,
            startTime: new Date(date.getTime() + 10 * 3_600_000),
            endTime: new Date(date.getTime() + 12 * 3_600_000),
            location: 'Εστία Τριφυλλίου',
            goal: week === 0 ? 'Γνωριμία και κανόνες ομάδας' : 'Ομαδικότητα και δεξιότητες υπαίθρου',
          },
        }));

      if (existing) continue;

      await prisma.timelineBlock.createMany({
        data: [
          {
            syggentrwshId: syggentrwsh.id,
            section: TimelineSection.ANOIGMA,
            order: 0,
            title: 'Έπαρση και προσευχή',
            durationMin: 10,
          },
          {
            syggentrwshId: syggentrwsh.id,
            section: TimelineSection.ANOIGMA,
            order: 1,
            title: 'Τραγούδι γνωριμίας',
            durationMin: 10,
          },
          {
            syggentrwshId: syggentrwsh.id,
            section: TimelineSection.KYRIO_MEROS,
            order: 0,
            title: 'Παιχνίδι σε υποομάδες',
            durationMin: 35,
          },
          {
            syggentrwshId: syggentrwsh.id,
            section: TimelineSection.KYRIO_MEROS,
            order: 1,
            title: 'Εργαστήρι δεξιοτήτων',
            durationMin: 35,
          },
          {
            syggentrwshId: syggentrwsh.id,
            section: TimelineSection.KLEISIMO,
            order: 0,
            title: 'Κύκλος απολογισμού',
            durationMin: 15,
          },
          {
            syggentrwshId: syggentrwsh.id,
            section: TimelineSection.KLEISIMO,
            order: 1,
            title: 'Υποστολή',
            durationMin: 5,
          },
        ],
      });

      // Απαιτούμενο υλικό στο εργαστήρι.
      const workshop = await prisma.timelineBlock.findFirst({
        where: { syggentrwshId: syggentrwsh.id, title: 'Εργαστήρι δεξιοτήτων' },
        select: { id: true },
      });
      if (workshop) {
        await prisma.timelineBlockYliko.createMany({
          data: [
            { blockId: workshop.id, ylikoId: yliko.get('Χαρτόνια Α3')!, qty: 10 },
            { blockId: workshop.id, ylikoId: yliko.get('Μαρκαδόροι')!, qty: 8 },
          ],
          skipDuplicates: true,
        });
      }

      // Τα στελέχη που αναλαμβάνουν τη συγκέντρωση.
      for (const stelexosId of members.slice(0, 2)) {
        await prisma.syggentrwshStelexos.upsert({
          where: { syggentrwshId_userId: { syggentrwshId: syggentrwsh.id, userId: stelexosId } },
          create: { syggentrwshId: syggentrwsh.id, userId: stelexosId },
          update: {},
        });
      }

      // Παρουσιολόγιο για τις περασμένες συγκεντρώσεις (οι δύο πρώτες).
      if (week < 2) {
        for (const [index, userId] of members.entries()) {
          const status =
            index % 7 === 3
              ? ParousiaStatus.APOUSIA
              : index % 5 === 2
                ? ParousiaStatus.DIKAIOLOGIMENI
                : index % 11 === 6
                  ? ParousiaStatus.ARGOPORIA
                  : ParousiaStatus.PAROUSIA;

          await prisma.parousia.upsert({
            where: { syggentrwshId_userId: { syggentrwshId: syggentrwsh.id, userId } },
            create: { syggentrwshId: syggentrwsh.id, userId, status, recordedAt: date },
            update: {},
          });
        }
      }
    }
  }
}

async function seedSymvoulia(
  topikoId: string,
  kladoi: Map<KladosType, Klados>,
  membersByKlados: Map<KladosType, string[]>,
): Promise<void> {
  const definitions: Array<{ type: SymvoulioType; klados: KladosType | null; title: string; date: Date }> = [
    {
      type: SymvoulioType.TOPIKOU,
      klados: null,
      title: 'Έναρξη χρονιάς — προγραμματισμός',
      date: new Date('2026-09-10T18:00:00Z'),
    },
    {
      type: SymvoulioType.STELEXON,
      klados: null,
      title: 'Κατανομή στελεχών ανά κλάδο',
      date: new Date('2026-09-17T18:00:00Z'),
    },
    {
      type: SymvoulioType.KLADOU,
      klados: 'ODIGOI',
      title: 'Σχεδιασμός τριμήνου Οδηγών',
      date: new Date('2026-09-24T18:00:00Z'),
    },
    {
      type: SymvoulioType.KLADOU,
      klados: 'POULIA',
      title: 'Συμβούλιο Πουλιών',
      date: new Date('2026-10-01T18:00:00Z'),
    },
  ];

  for (const def of definitions) {
    const existing = await prisma.symvoulio.findFirst({ where: { topikoId, title: def.title } });
    if (existing) continue;

    const kladosId = def.klados ? kladoi.get(def.klados)!.id : null;
    const chairId = def.klados ? membersByKlados.get(def.klados)?.[0] : membersByKlados.get('ODIGOI')?.[0];

    await prisma.symvoulio.create({
      data: {
        topikoId,
        kladosId,
        type: def.type,
        title: def.title,
        date: def.date,
        location: 'Εστία Τριφυλλίου',
        chairId,
        agenda: [
          '- Απολογισμός προηγούμενης περιόδου',
          '- Πρόγραμμα δράσεων',
          '- Έλεγχος υλικού αποθήκης',
        ].join('\n'),
        minutes: [
          '## Απολογισμός προηγούμενης περιόδου',
          '',
          'Συζητήθηκαν οι συμμετοχές και τα οικονομικά της περασμένης χρονιάς.',
          '',
          '**Απόφαση:** Εγκρίθηκε ο απολογισμός.',
          '',
          '## Πρόγραμμα δράσεων',
          '',
          'Προτάθηκαν μονοήμερη τον Νοέμβριο και κατασκήνωση τον Ιούλιο.',
          '',
          '**Απόφαση:** Οριστικοποιείται στο επόμενο συμβούλιο.',
          '',
          '## Έλεγχος υλικού αποθήκης',
          '',
          'Εκκρεμεί καταγραφή πριν την επόμενη δράση.',
        ].join('\n'),
        // Όσοι ήταν εκεί: τα στελέχη του κλάδου, ή τα δύο πρώτα για το Τοπικό.
        participants: {
          create: (def.klados
            ? (membersByKlados.get(def.klados) ?? []).slice(0, 2)
            : (membersByKlados.get('ODIGOI') ?? []).slice(0, 2)
          ).map((userId) => ({ userId })),
        },
      },
    });
  }
}

async function seedProodos(
  kladoi: Map<KladosType, Klados>,
  membersByKlados: Map<KladosType, string[]>,
  periodId: string,
): Promise<void> {
  for (const [type, klados] of kladoi) {
    const goals = await prisma.proodosGoal.findMany({
      where: { kladosId: klados.id },
      orderBy: { order: 'asc' },
    });
    const members = (membersByKlados.get(type) ?? []).slice(2); // μόνο τα παιδιά

    for (const [memberIndex, userId] of members.entries()) {
      for (const [goalIndex, goal] of goals.entries()) {
        const rank = (memberIndex + goalIndex) % 4;
        const status =
          rank === 0
            ? ProodosStatus.OLOKLIROMENO
            : rank === 1
              ? ProodosStatus.SE_EXELIXI
              : ProodosStatus.DEN_XEKINISE;

        if (status === ProodosStatus.DEN_XEKINISE) continue;

        await prisma.proodosRecord.upsert({
          where: { userId_goalId: { userId, goalId: goal.id } },
          create: {
            userId,
            goalId: goal.id,
            periodId,
            status,
            completedAt: status === ProodosStatus.OLOKLIROMENO ? SEASON_START : null,
          },
          update: {},
        });
      }
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error('Το seed απέτυχε:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
