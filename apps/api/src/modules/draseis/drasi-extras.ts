import { BadRequestException } from '@nestjs/common';
import { PROGRAMMATIKO_KINDS, type DrasiExtraItemView, type DrasiScheduleKind } from '@trifylli/shared';

/** Ό,τι χρειάζεται η κάρτα ενός προγραμματικού εκτός ωρολογίου. */
export const extraInclude = {
  assignees: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
  yliko: { select: { id: true, label: true, qty: true, packed: true }, orderBy: { order: 'asc' } },
} as const;

export function toExtraView(r: {
  id: string;
  title: string;
  kind: DrasiExtraItemView['kind'];
  status: DrasiExtraItemView['status'];
  durationMin: number;
  location: string | null;
  description: string | null;
  createdAt: Date;
  assignees: { user: { id: string; firstName: string; lastName: string } }[];
  yliko: { id: string; label: string; qty: number; packed: boolean }[];
}): DrasiExtraItemView {
  const responsibles = r.assignees
    .map((a) => a.user)
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'el') || a.firstName.localeCompare(b.firstName, 'el'));
  return {
    id: r.id,
    title: r.title,
    kind: r.kind,
    status: r.status,
    durationMin: r.durationMin,
    location: r.location,
    description: r.description,
    responsibles,
    yliko: r.yliko.map((y) => ({ id: y.id, label: y.label, qty: y.qty, packed: y.packed })),
    hasProgramma: Boolean(r.description || responsibles.length || r.yliko.length),
    createdAt: r.createdAt.toISOString(),
  };
}

/** Ένα προγραμματικό εκτός ωρολογίου έχει πάντα είδος με κείμενο (όχι γεύμα, ξεκούραση, υπηρεσία). */
export function assertExtraKind(kind: DrasiScheduleKind | undefined): void {
  if (kind !== undefined && !PROGRAMMATIKO_KINDS.includes(kind)) {
    throw new BadRequestException('Εκτός ωρολογίου μπαίνουν μόνο δραστηριότητες, μετακινήσεις, τελετές και «άλλο».');
  }
}

/**
 * Το στοιχείο του ωρολογίου που γίνεται ένα έξτρα όταν μπει σε μια ημέρα: το
 * ΙΔΙΟ id (κοινό έγγραφο, έγκριση, σχόλια, ιστορικό μένουν), στο τέλος της ημέρας,
 * με το προγραμματικό, τους υπεύθυνους και το υλικό του — και το σακίδιο όπως ήταν.
 */
export function scheduledFromExtra(
  extra: {
    id: string;
    drasiId: string;
    title: string;
    kind: DrasiScheduleKind;
    status: DrasiExtraItemView['status'];
    durationMin: number;
    location: string | null;
    description: string | null;
    assignees: { userId: string }[];
    yliko: { id: string; order: number; label: string; qty: number; packed: boolean; packedById: string | null; packedAt: Date | null }[];
  },
  date: Date,
  order: number,
) {
  return {
    id: extra.id,
    drasiId: extra.drasiId,
    date,
    order,
    durationMin: extra.durationMin,
    title: extra.title,
    kind: extra.kind,
    status: extra.status,
    location: extra.location,
    description: extra.description,
    ...(extra.assignees.length ? { assignees: { create: extra.assignees.map((a) => ({ userId: a.userId })) } } : {}),
    ...(extra.yliko.length
      ? {
          yliko: {
            create: extra.yliko.map((y) => ({
              id: y.id,
              order: y.order,
              label: y.label,
              qty: y.qty,
              packed: y.packed,
              packedById: y.packedById,
              packedAt: y.packedAt,
            })),
          },
        }
      : {}),
  };
}
