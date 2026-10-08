import { describe, expect, it } from 'vitest';
import { drasiAccess, drasiCan } from '@trifylli/shared';

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
