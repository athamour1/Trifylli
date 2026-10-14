import { describe, expect, it } from 'vitest';
import { accessEmailProblem } from './external-access';

describe('accessEmailProblem', () => {
  it('ελεύθερο email: η πρόσβαση δίνεται', () => {
    expect(accessEmailProblem(null, 'g1')).toBeNull();
  });

  it('email ατόμου του μητρώου: όχι — αυτό μπαίνει στη δράση από το μητρώο', () => {
    expect(accessEmailProblem({ id: 'm1', accountRole: null }, 'g1')).toBe('registry');
    expect(accessEmailProblem({ id: 'm2', accountRole: 'STELEXOS' }, 'g1')).toBe('registry');
  });

  it('email άλλου εξωτερικού στελέχους: όχι — θα γινόταν δεύτερο άτομο με το ίδιο email', () => {
    expect(accessEmailProblem({ id: 'x1', accountRole: 'EXTERNAL' }, 'g1')).toBe('external');
  });

  it('το email είναι ήδη του ίδιου ατόμου: κανένα πρόβλημα', () => {
    expect(accessEmailProblem({ id: 'g1', accountRole: null }, 'g1')).toBeNull();
  });
});
