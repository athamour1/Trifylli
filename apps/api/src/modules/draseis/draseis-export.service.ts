import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import {
  DRASI_EXPENSE_CATEGORIES,
  DRASI_FEE_KIND_LABEL,
  DRASI_LEDGER_KIND_LABEL,
  DRASI_TYPE_LABEL,
  KLADOS_LABEL,
  DRASI_PAYMENT_HANDLING_LABEL,
  TREASURY_CATEGORY_LABEL,
  type DrasiType,
  type KladosType,
} from '@trifylli/shared';
import type { RequestUser } from '../../common/auth/types';
import { DraseisFinanceService } from './draseis-finance.service';

/**
 * Το ταμείο μιας δράσης ως βιβλίο Excel — στη δομή του υποδείγματος που
 * χρησιμοποιεί ήδη το Τοπικό: ένα φύλλο ανά κατηγορία εξόδων με
 * `Α/Α · Ημερομηνία · Αιτιολογία · Ποσό · Άθροισμα · Απόδειξη`, Έσοδα,
 * Προϋπολογισμός, Λογαριασμοί στελεχών, Συμμετοχές.
 *
 * Το «Άθροισμα» είναι **τύπος** (`SUM`), όχι τιμή: ο ταμίας που θα προσθέσει μια
 * γραμμή στο Excel θέλει το σύνολο να ακολουθήσει. Παράγεται στη μνήμη — το
 * container του API είναι read-only.
 */
@Injectable()
export class DraseisExportService {
  constructor(private readonly finance: DraseisFinanceService) {}

  async workbook(user: RequestUser, id: string): Promise<{ filename: string; buffer: Buffer }> {
    const drasi = await this.finance.load(user, id, 'read');
    const [summary, entries, budget, participants, ledger] = await Promise.all([
      this.finance.summary(user, id),
      this.finance.entries(user, id),
      this.finance.budget(user, id),
      this.finance.participants(user, id),
      this.finance.ledger(user, id),
    ]);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Trifylli';
    wb.created = new Date();

    const money = '#,##0.00 "€"';
    const pct = '0.0%';
    const headerStyle = (row: ExcelJS.Row) => {
      row.font = { bold: true };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF4' } };
    };

    // ── Σύνοψη ──
    const sum = wb.addWorksheet('Σύνοψη');
    sum.columns = [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 12 }];
    sum.addRow([drasi.title]).font = { bold: true, size: 14 };
    sum.addRow([
      `${DRASI_TYPE_LABEL[drasi.type as DrasiType]} · ${fmtDate(drasi.dateStart)}${sameDay(drasi.dateStart, drasi.dateEnd) ? '' : ` – ${fmtDate(drasi.dateEnd)}`}${drasi.location ? ` · ${drasi.location}` : ''}`,
    ]);
    sum.addRow([`Φορέας: ${drasi.klados ? KLADOS_LABEL[drasi.klados.type as KladosType] : 'Τοπικό'}`]);
    sum.addRow([]);
    sum.addRow(['Έσοδα', summary.income]).getCell(2).numFmt = money;
    sum.addRow(['  από συμμετοχές', summary.incomeFromPayments]).getCell(2).numFmt = money;
    sum.addRow(['  από κινήσεις (επιχορήγηση, δωρεές…)', summary.incomeFromEntries]).getCell(2).numFmt = money;
    sum.addRow(['Έξοδα', summary.expense]).getCell(2).numFmt = money;
    const balanceRow = sum.addRow(['Υπόλοιπο', summary.balance]);
    balanceRow.getCell(2).numFmt = money;
    balanceRow.font = { bold: true };
    sum.addRow([]);
    headerStyle(sum.addRow(['Κατηγορία εξόδων', 'Προϋπολογισμός', 'Πραγματικό', 'Στόχος %', 'Πραγματικό %']));
    for (const line of summary.expenses) {
      const row = sum.addRow([
        TREASURY_CATEGORY_LABEL[line.category] ?? line.category,
        line.planned,
        line.actual,
        line.targetPct,
        line.actualPct,
      ]);
      row.getCell(2).numFmt = money;
      row.getCell(3).numFmt = money;
      row.getCell(4).numFmt = pct;
      row.getCell(5).numFmt = pct;
    }

    // ── Έσοδα ──
    const inc = wb.addWorksheet('Έσοδα');
    inc.columns = [{ width: 6 }, { width: 14 }, { width: 44 }, { width: 14 }, { width: 14 }, { width: 28 }];
    headerStyle(inc.addRow(['Α/Α', 'ΗΜΕΡΟΜΗΝΙΑ', 'ΑΙΤΙΟΛΟΓΙΑ', 'ΠΟΣΟ', 'ΑΘΡΟΙΣΜΑ', 'ΑΠΟΔΕΙΞΗ']));
    // Οι συμμετοχές ως ομάδες: πλήθος × ποσό, όπως στο υπόδειγμα.
    let n = 0;
    for (const k of summary.fees.byKind) {
      n += 1;
      const row = inc.addRow([n, '', `Συμμετοχές — ${DRASI_FEE_KIND_LABEL[k.kind]} (${k.count} άτομα, οφειλόμενα)`, k.amount, { formula: `SUM($D$2:D${inc.rowCount + 1})` }, '']);
      row.getCell(4).numFmt = money;
      row.getCell(5).numFmt = money;
    }
    n += 1;
    const collectedRow = inc.addRow([n, '', 'Συμμετοχές — εισπραγμένα μέχρι σήμερα', summary.fees.collected, '', '']);
    collectedRow.getCell(4).numFmt = money;
    collectedRow.font = { italic: true };
    for (const e of entries.filter((x) => x.kind === 'INCOME').sort(byDate)) {
      n += 1;
      const row = inc.addRow([
        n,
        fmtDate(new Date(e.occurredAt)),
        `${TREASURY_CATEGORY_LABEL[e.category] ?? e.category}${e.description ? ` — ${e.description}` : ''}`,
        e.amount,
        { formula: `SUM($D$2:D${inc.rowCount + 1})` },
        e.receipt?.filename ?? '',
      ]);
      row.getCell(4).numFmt = money;
      row.getCell(5).numFmt = money;
    }

    // ── Ένα φύλλο ανά κατηγορία εξόδων ──
    for (const category of DRASI_EXPENSE_CATEGORIES) {
      const ws = wb.addWorksheet(sheetName(TREASURY_CATEGORY_LABEL[category] ?? category));
      ws.columns = [{ width: 6 }, { width: 14 }, { width: 44 }, { width: 14 }, { width: 14 }, { width: 28 }];
      headerStyle(ws.addRow(['Α/Α', 'ΗΜΕΡΟΜΗΝΙΑ', 'ΑΙΤΙΟΛΟΓΙΑ', 'ΠΟΣΟ', 'ΑΘΡΟΙΣΜΑ', 'ΑΠΟΔΕΙΞΗ']));
      let i = 0;
      for (const e of entries.filter((x) => x.kind === 'EXPENSE' && x.category === category).sort(byDate)) {
        i += 1;
        const row = ws.addRow([
          i,
          fmtDate(new Date(e.occurredAt)),
          e.description ?? '',
          e.amount,
          { formula: `SUM($D$2:D${ws.rowCount + 1})` },
          e.receipt?.filename ?? '',
        ]);
        row.getCell(4).numFmt = money;
        row.getCell(5).numFmt = money;
      }
      const total = ws.addRow(['', '', 'ΣΥΝΟΛΟ', { formula: i > 0 ? `SUM(D2:D${i + 1})` : '0' }, '', '']);
      total.font = { bold: true };
      total.getCell(4).numFmt = money;
    }

    // ── Προϋπολογισμός ──
    const bud = wb.addWorksheet('Προϋπολογισμός');
    bud.columns = [{ width: 24 }, { width: 16 }, { width: 12 }, { width: 16 }, { width: 12 }, { width: 16 }];
    headerStyle(bud.addRow(['ΚΑΤΗΓΟΡΙΑ', 'ΠΡΟΫΠΟΛΟΓΙΣΜΟΣ', 'ΣΤΟΧΟΣ %', 'ΠΡΑΓΜΑΤΙΚΟ', 'ΠΡΑΓΜ. %', 'ΑΠΟΚΛΙΣΗ']));
    for (const line of summary.expenses) {
      const b = budget.find((x) => x.category === line.category);
      const row = bud.addRow([
        TREASURY_CATEGORY_LABEL[line.category] ?? line.category,
        b?.planned ?? 0,
        b?.targetPct ?? null,
        line.actual,
        line.actualPct,
        { formula: `D${bud.rowCount + 1}-B${bud.rowCount + 1}` },
      ]);
      row.getCell(2).numFmt = money;
      row.getCell(3).numFmt = pct;
      row.getCell(4).numFmt = money;
      row.getCell(5).numFmt = pct;
      row.getCell(6).numFmt = money;
    }

    // ── Λογαριασμοί στελεχών ──
    if (ledger.length > 0) {
      const led = wb.addWorksheet('Λογαριασμοί στελεχών');
      led.columns = [{ width: 28 }, { width: 14 }, { width: 30 }, { width: 14 }, { width: 36 }, { width: 14 }];
      headerStyle(led.addRow(['ΣΤΕΛΕΧΟΣ', 'ΗΜΕΡΟΜΗΝΙΑ', 'ΚΙΝΗΣΗ', 'ΠΟΣΟ', 'ΣΗΜΕΙΩΣΗ', 'ΤΑΚΤΟΠΟΙΗΘΗΚΕ']));
      for (const acc of ledger) {
        for (const e of acc.entries) {
          const row = led.addRow([
            `${acc.user.lastName} ${acc.user.firstName}`,
            fmtDate(new Date(e.occurredAt)),
            DRASI_LEDGER_KIND_LABEL[e.kind],
            e.amount,
            e.note ?? '',
            e.settledAt ? 'ναι' : '',
          ]);
          row.getCell(4).numFmt = money;
        }
        const row = led.addRow([`${acc.user.lastName} ${acc.user.firstName} — υπόλοιπο`, '', '', acc.balance, '', '']);
        row.font = { bold: true };
        row.getCell(4).numFmt = money;
      }
    }

    // ── Συμμετοχές ──
    const part = wb.addWorksheet('Συμμετοχές');
    part.columns = [{ width: 30 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 26 }, { width: 24 }];
    headerStyle(part.addRow(['ΟΝΟΜΑΤΕΠΩΝΥΜΟ', 'ΚΛΑΔΟΣ', 'ΕΙΔΟΣ', 'ΣΥΜΜΕΤΟΧΗ', 'ΜΕΤΑΦΟΡΙΚΑ', 'ΠΛΗΡΩΜΕΝΑ', 'ΥΠΟΛΟΙΠΟ', 'ΥΠΕΥΘΥΝΟΣ ΕΙΣΠΡΑΞΗΣ', 'ΣΤΑΔΙΟ']));
    for (const p of participants) {
      const last = p.payments[p.payments.length - 1];
      const row = part.addRow([
        `${p.user.lastName} ${p.user.firstName}`,
        p.user.kladosType ? KLADOS_LABEL[p.user.kladosType] : (p.user.guestTopikoName ?? ''),
        DRASI_FEE_KIND_LABEL[p.feeKind],
        p.feeKind === 'DOREAN' ? 0 : (p.feeAmount ?? 0),
        p.transportAmount ?? 0,
        p.paid,
        p.balance,
        p.collector ? `${p.collector.lastName} ${p.collector.firstName}` : '',
        last?.handlingStatus ? DRASI_PAYMENT_HANDLING_LABEL[last.handlingStatus] : '',
      ]);
      for (const c of [4, 5, 6, 7]) row.getCell(c).numFmt = money;
    }
    const totals = part.addRow([
      'ΣΥΝΟΛΟ',
      '',
      '',
      { formula: `SUM(D2:D${part.rowCount})` },
      { formula: `SUM(E2:E${part.rowCount})` },
      { formula: `SUM(F2:F${part.rowCount})` },
      { formula: `SUM(G2:G${part.rowCount})` },
      '',
      '',
    ]);
    totals.font = { bold: true };
    for (const c of [4, 5, 6, 7]) totals.getCell(c).numFmt = money;

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const filename = `Ταμείο — ${drasi.title.replace(/[\\/:*?"<>|]+/g, ' ').trim()} — ${fmtDate(new Date()).replace(/\//g, '-')}.xlsx`;
    return { filename, buffer };
  }
}

function fmtDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function byDate(a: { occurredAt: string }, b: { occurredAt: string }): number {
  return a.occurredAt.localeCompare(b.occurredAt);
}

/** Το Excel δεν δέχεται `[]:*?/\` στα ονόματα φύλλων και κόβει στους 31 χαρακτήρες. */
function sheetName(label: string): string {
  return label.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);
}
