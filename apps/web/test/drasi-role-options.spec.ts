import { describe, expect, it } from 'vitest';
import { drasiRoleOptions } from '../src/components/drasi/types';

const person = (id: string, lastName: string, firstName: string) => ({ id, firstName, lastName });

describe('drasiRoleOptions', () => {
  it('μόνο τα στελέχη που συμμετέχουν, αλφαβητικά, με τη λεζάντα τους', () => {
    const stelexi = [person('u-2', 'Παπαδοπούλου', 'Μαρία'), person('u-1', 'Άλφα', 'Ελένη')];
    const captions = new Map([['u-2', 'Εξωτερικό · Ελευσίνα']]);

    const { options } = drasiRoleOptions(stelexi, [], (id) => captions.get(id) ?? '');

    expect(options).toEqual([
      { label: 'Άλφα Ελένη', value: 'u-1', caption: '' },
      { label: 'Παπαδοπούλου Μαρία', value: 'u-2', caption: 'Εξωτερικό · Ελευσίνα' },
    ]);
  });

  it('όποιος έχει ήδη ρόλο χωρίς να συμμετέχει: χωριστά, μία φορά, για να βγει', () => {
    const maria = person('u-2', 'Παπαδοπούλου', 'Μαρία');
    const nikos = person('u-9', 'Νικολάου', 'Νίκος');

    const { options, outsiders } = drasiRoleOptions([maria], [maria, nikos, nikos]);

    expect(options.map((o) => o.value)).toEqual(['u-2']);
    expect(outsiders).toEqual([{ label: 'Νικολάου Νίκος', value: 'u-9', caption: 'Δεν είναι στους συμμετέχοντες' }]);
  });
});
