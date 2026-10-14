import { describe, expect, it } from 'vitest';
import { planResponsibles } from './schedule-assignees';

describe('planResponsibles', () => {
  it('λίστα που δεν στάλθηκε: μένουν όπως είναι', () => {
    expect(planResponsibles(['a', 'b'], undefined)).toEqual({ create: [], remove: [] });
    expect(planResponsibles(['a', 'b'], ['b', 'a'])).toEqual({ create: [], remove: [] });
  });

  it('νέα λίστα: μπαίνουν όσοι λείπουν, βγαίνουν όσοι δεν είναι πια — οι υπόλοιποι δεν αγγίζονται', () => {
    expect(planResponsibles(['a', 'b'], ['b', 'c'])).toEqual({ create: ['c'], remove: ['a'] });
  });

  it('άδεια λίστα ή null: βγαίνουν όλοι', () => {
    expect(planResponsibles(['a', 'b'], [])).toEqual({ create: [], remove: ['a', 'b'] });
    expect(planResponsibles(['a'], null)).toEqual({ create: [], remove: ['a'] });
  });

  it('διπλό όνομα στη λίστα μετράει μία φορά', () => {
    expect(planResponsibles([], ['c', 'c'])).toEqual({ create: ['c'], remove: [] });
  });
});
