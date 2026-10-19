import { describe, expect, it } from 'vitest';
import { CHARACTER_OWN_FIELDS, SCHEDULE_ITEM_OWN_FIELDS, drasiAccess, drasiCan, drasiEditScope, fieldsOutside } from '@trifylli/shared';

describe('δικαιώματα μέσα στη δράση', () => {
  it('όποιος δεν είναι στέλεχος της δράσης δεν βλέπει τίποτα', () => {
    const a = drasiAccess({ full: false, staff: false, roles: [] });
    expect(drasiCan(a, 'episkopisi')).toBe(false);
  });

  it('στέλεχος χωρίς ρόλο: βλέπει τα πάντα εκτός από ταμείο, υλικό, φαρμακείο — δεν αλλάζει τίποτα', () => {
    const a = drasiAccess({ full: false, staff: true, roles: [] });
    for (const p of ['programma', 'mythos', 'participants', 'omades', 'entypa', 'axiologisi', 'ektyposi'] as const) expect(drasiCan(a, p)).toBe(true);
    for (const p of ['tamio', 'yliko', 'farmakeio', 'rythmiseis'] as const) expect(drasiCan(a, p)).toBe(false);
    expect(a.edit).toEqual([]);
  });

  it('ταμίας: μόνο αυτός καταχωρεί, πληρωμές και παράδοση', () => {
    const t = drasiAccess({ full: false, staff: true, roles: ['TAMIAS'] });
    expect(drasiCan(t, 'tamio', 'edit')).toBe(true);
    expect(drasiCan(t, 'handover', 'edit')).toBe(true);
    const arx = drasiAccess({ full: false, staff: true, roles: ['ARXIGOS'] });
    expect(drasiCan(arx, 'tamio')).toBe(true);
    expect(drasiCan(arx, 'tamio', 'edit')).toBe(false);
    expect(drasiCan(arx, 'handover', 'edit')).toBe(false);
  });

  it('αρχηγός δράσης: αλλάζει τα πάντα εκτός από τα χρήματα, και κλείνει', () => {
    const a = drasiAccess({ full: false, staff: true, roles: ['ARXIGOS'] });
    for (const p of ['programma', 'omades', 'arxigeio', 'rythmiseis', 'close', 'yliko'] as const) expect(drasiCan(a, p, 'edit')).toBe(true);
  });

  it('λειτουργία: ομάδες, έντυπα, υλικό, αξιολόγηση· βλέπει ταμείο χωρίς να γράφει', () => {
    const a = drasiAccess({ full: false, staff: true, roles: ['LEITOURGIA'] });
    for (const p of ['omades', 'entypa', 'yliko', 'axiologisi'] as const) expect(drasiCan(a, p, 'edit')).toBe(true);
    expect(drasiCan(a, 'tamio')).toBe(true);
    expect(drasiCan(a, 'tamio', 'edit')).toBe(false);
    expect(drasiCan(a, 'programma', 'edit')).toBe(false);
  });

  it('πρόγραμμα: μύθος και πρόγραμμα', () => {
    const a = drasiAccess({ full: false, staff: true, roles: ['PROGRAMMA'] });
    expect(drasiCan(a, 'mythos', 'edit')).toBe(true);
    expect(drasiCan(a, 'programma', 'edit')).toBe(true);
    expect(drasiCan(a, 'omades', 'edit')).toBe(false);
  });

  it('φαρμακείο: φαρμακεία και έντυπα υγείας', () => {
    const a = drasiAccess({ full: false, staff: true, roles: ['FARMAKEIO'] });
    expect(drasiCan(a, 'farmakeio', 'edit')).toBe(true);
    expect(drasiCan(a, 'entypa', 'edit')).toBe(true);
    expect(drasiCan(a, 'tamio')).toBe(false);
  });

  it('πλήρης πρόσβαση (διαχειριστής/υπερδιαχειριστής): όλα, και στο ταμείο', () => {
    const a = drasiAccess({ full: true, staff: false, roles: [] });
    expect(drasiCan(a, 'tamio', 'edit')).toBe(true);
    expect(drasiCan(a, 'handover', 'edit')).toBe(true);
  });
});

describe('το δικό του κομμάτι: υπεύθυνος στοιχείου, ρόλος του μύθου', () => {
  const staff = drasiAccess({ full: false, staff: true, roles: [] });
  const programma = drasiAccess({ full: false, staff: true, roles: ['PROGRAMMA'] });
  const outsider = drasiAccess({ full: false, staff: false, roles: [] });

  it('ρόλος με δικαίωμα αλλαγής: τα πάντα, δικά του ή όχι', () => {
    expect(drasiEditScope(programma, 'programma', false)).toBe('all');
    expect(drasiEditScope(programma, 'programma', true)).toBe('all');
    expect(drasiEditScope(programma, 'mythos', false)).toBe('all');
  });

  it('στέλεχος χωρίς ρόλο: μόνο ό,τι είναι δικό του', () => {
    expect(drasiEditScope(staff, 'programma', true)).toBe('own');
    expect(drasiEditScope(staff, 'mythos', true)).toBe('own');
    expect(drasiEditScope(staff, 'programma', false)).toBe('none');
    expect(drasiEditScope(staff, 'mythos', false)).toBe('none');
  });

  it('χωρίς πρόσβαση στη δράση (π.χ. εξωτερικός σε κλειστή), ούτε το δικό του', () => {
    expect(drasiEditScope(outsider, 'programma', true)).toBe('none');
    expect(drasiEditScope(null, 'mythos', true)).toBe('none');
  });
});

describe('πεδία έξω από όσα επιτρέπονται', () => {
  it('ό,τι δεν στάλθηκε (undefined) δεν μετράει· το null («σβήσε») μετράει', () => {
    expect(fieldsOutside({ description: 'x', title: undefined, durationMin: 45, responsibleIds: null }, SCHEDULE_ITEM_OWN_FIELDS)).toEqual([
      'durationMin',
      'responsibleIds',
    ]);
  });

  it('ο υπεύθυνος γράφει κείμενο, χώρο και υλικό — όχι τίτλο, λεπτά, είδος, ημέρα, υπεύθυνους', () => {
    expect(fieldsOutside({ location: 'Δάσος', description: '# Πορεία', yliko: [{ label: 'σχοινιά' }] }, SCHEDULE_ITEM_OWN_FIELDS)).toEqual([]);
    for (const f of ['title', 'durationMin', 'kind', 'date', 'responsibleIds']) {
      expect(fieldsOutside({ [f]: 'κάτι' }, SCHEDULE_ITEM_OWN_FIELDS)).toEqual([f]);
    }
  });

  it('στον ρόλο του μύθου: όνομα και lore — όχι ποιος τον παίζει', () => {
    expect(fieldsOutside({ name: 'Η Μάγισσα', lore: 'Ζει στο δάσος.' }, CHARACTER_OWN_FIELDS)).toEqual([]);
    expect(fieldsOutside({ participantId: null }, CHARACTER_OWN_FIELDS)).toEqual(['participantId']);
  });
});

describe('διατροφολόγιο', () => {
  it('κάθε στέλεχος το βλέπει, χωρίς να το αλλάζει', () => {
    const a = drasiAccess({ full: false, staff: true, roles: [] });
    expect(drasiCan(a, 'diatrofologio')).toBe(true);
    expect(drasiCan(a, 'diatrofologio', 'edit')).toBe(false);
  });

  it('το γράφουν η μαγείρισσα, η τροφοδοσία, η λειτουργία και ο αρχηγός της δράσης', () => {
    for (const role of ['MAGEIRISSA', 'TROFODOSIA', 'LEITOURGIA', 'ARXIGOS'] as const) {
      expect(drasiCan(drasiAccess({ full: false, staff: true, roles: [role] }), 'diatrofologio', 'edit')).toBe(true);
    }
  });

  it('οι άλλοι ρόλοι μόνο το βλέπουν', () => {
    for (const role of ['PROGRAMMA', 'TAMIAS', 'FARMAKEIO'] as const) {
      const a = drasiAccess({ full: false, staff: true, roles: [role] });
      expect(drasiCan(a, 'diatrofologio')).toBe(true);
      expect(drasiCan(a, 'diatrofologio', 'edit')).toBe(false);
    }
  });

  it('η εφεδρεία (πλήρης πρόσβαση) το γράφει', () => {
    expect(drasiCan(drasiAccess({ full: true, staff: false, roles: [] }), 'diatrofologio', 'edit')).toBe(true);
  });
});
