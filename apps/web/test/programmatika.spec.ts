import { describe, expect, it } from 'vitest';
import type { DrasiScheduleItemView, DrasiScheduleView } from '@trifylli/shared';
import { kanbanColumns, moveCard } from '../src/lib/programmatika';

function item(id: string, over: Partial<DrasiScheduleItemView> = {}): DrasiScheduleItemView {
  return {
    id,
    date: '2026-11-14',
    order: 0,
    durationMin: 60,
    startsAt: '2026-11-14T09:00:00.000Z',
    endsAt: '2026-11-14T10:00:00.000Z',
    title: id,
    kind: 'DRASTIRIOTITA',
    status: 'TODO',
    snack: null,
    location: null,
    description: null,
    responsibles: [],
    yliko: [],
    hasProgramma: false,
    delayMin: 0,
    ...over,
  };
}

const view = (items: DrasiScheduleItemView[]): DrasiScheduleView => ({
  days: [{ date: '2026-11-14', startTime: '09:00', overridden: false, items, delays: [] }],
  stelexi: [],
});

describe('kanban προγραμματικών', () => {
  it('όλα τα στοιχεία εκτός από τα γεύματα — και η δραστηριότητα με δεκατιανό μένει', () => {
    const columns = kanbanColumns(
      view([item('a'), item('gevma', { kind: 'GEVMA' }), item('dekatiano', { snack: 'DEKATIANO' }), item('teleti', { kind: 'TELETI' })]),
    );
    expect(columns.TODO.map((c) => c.id)).toEqual(['a', 'dekatiano', 'teleti']);
  });

  it('κάθε στοιχείο στη στήλη της κατάστασής του, με τη σειρά του ωρολογίου', () => {
    const columns = kanbanColumns({
      days: [
        { date: '2026-11-15', startTime: '09:00', overridden: false, items: [item('next-day', { startsAt: '2026-11-15T09:00:00.000Z', status: 'DONE' })], delays: [] },
        {
          date: '2026-11-14',
          startTime: '09:00',
          overridden: false,
          items: [item('late', { startsAt: '2026-11-14T15:00:00.000Z', status: 'DONE' }), item('early', { status: 'DONE' }), item('doing', { status: 'IN_PROGRESS' })],
          delays: [],
        },
      ],
      stelexi: [],
    });
    expect(columns.DONE.map((c) => c.id)).toEqual(['early', 'late', 'next-day']);
    expect(columns.IN_PROGRESS.map((c) => c.id)).toEqual(['doing']);
    expect(columns.TODO).toEqual([]);
  });

  it('μετακίνηση: αλλάζει μόνο η κατάσταση της κάρτας — και καμία αλλαγή στην ίδια στήλη', () => {
    const v = view([item('a'), item('b')]);
    expect(moveCard(v, 'a', 'DONE')).toBe(true);
    expect(kanbanColumns(v).DONE.map((c) => c.id)).toEqual(['a']);
    expect(moveCard(v, 'a', 'DONE')).toBe(false);
    expect(moveCard(v, 'missing', 'TODO')).toBe(false);
  });
});
