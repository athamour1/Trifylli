import { describe, expect, it } from 'vitest';
import { planAssignees } from './schedule-assignees';

const current = [
  { userId: 'a', duty: 'DIEXAGOGI' as const },
  { userId: 'b', duty: 'DIEXAGOGI' as const },
  { userId: 'a', duty: 'YLOPOIISI' as const },
];

describe('planAssignees', () => {
  it('ρόλος που δεν στάλθηκε μένει όπως είναι', () => {
    expect(planAssignees(current, {})).toEqual({ create: [], remove: [] });
    expect(planAssignees(current, { DIEXAGOGI: ['a', 'b'] })).toEqual({ create: [], remove: [] });
  });

  it('νέα λίστα: μπαίνουν όσοι λείπουν, βγαίνουν όσοι δεν είναι πια — οι υπόλοιποι δεν αγγίζονται', () => {
    expect(planAssignees(current, { DIEXAGOGI: ['b', 'c'] })).toEqual({
      create: [{ userId: 'c', duty: 'DIEXAGOGI' }],
      remove: [{ userId: 'a', duty: 'DIEXAGOGI' }],
    });
  });

  it('άδεια λίστα ή null: βγαίνουν όλοι από αυτόν τον ρόλο, όχι από τον άλλο', () => {
    const removeAll = { create: [], remove: [{ userId: 'a', duty: 'YLOPOIISI' }] };
    expect(planAssignees(current, { YLOPOIISI: [] })).toEqual(removeAll);
    expect(planAssignees(current, { YLOPOIISI: null })).toEqual(removeAll);
  });

  it('το ίδιο στέλεχος μπορεί να έχει και διεξαγωγή και υλοποίηση', () => {
    expect(planAssignees(current, { YLOPOIISI: ['a', 'b'] })).toEqual({ create: [{ userId: 'b', duty: 'YLOPOIISI' }], remove: [] });
  });

  it('διπλό όνομα στη λίστα μετράει μία φορά', () => {
    expect(planAssignees([], { DIEXAGOGI: ['c', 'c'], YLOPOIISI: ['c'] })).toEqual({
      create: [
        { userId: 'c', duty: 'DIEXAGOGI' },
        { userId: 'c', duty: 'YLOPOIISI' },
      ],
      remove: [],
    });
  });
});
