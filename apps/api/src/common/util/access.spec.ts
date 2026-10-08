import { describe, expect, it } from 'vitest';
import { AccountRole, can, canAccessKlados, stelexosGrants, visibleKladoi, type AccessProfile } from '@trifylli/shared';

const stelexos = (grants: AccessProfile['grants']): AccessProfile => ({ role: AccountRole.STELEXOS, adminKlados: null, grants });

describe('δικαιώματα στελεχών', () => {
  it('απλό στέλεχος: βλέπει και περνά παρουσίες, δεν αγγίζει ταμείο', () => {
    const p = stelexos(stelexosGrants([{ klados: 'ODIGOI', isArchigos: false, duties: [] }]));
    expect(can(p, 'calendar:read', 'ODIGOI')).toBe(true);
    expect(can(p, 'parousiologio:write', 'ODIGOI')).toBe(true);
    expect(can(p, 'treasury:manage', 'ODIGOI')).toBe(false);
    expect(can(p, 'drasi:write', 'ODIGOI')).toBe(false);
  });

  it('η υπευθυνότητα ξεκλειδώνει δικαιώματα μόνο στον κλάδο της', () => {
    const p = stelexos(
      stelexosGrants([
        { klados: 'ODIGOI', isArchigos: false, duties: ['TAMIAS'] },
        { klados: 'POULIA', isArchigos: false, duties: [] },
      ]),
    );
    expect(can(p, 'treasury:manage', 'ODIGOI')).toBe(true);
    expect(can(p, 'treasury:manage', 'POULIA')).toBe(false);
    // Χωρίς κλάδο: «σε κάποιον» — η εμβέλεια ελέγχεται μετά στο service.
    expect(can(p, 'treasury:manage')).toBe(true);
  });

  it('ο Αρχηγός του e-SEO έχει ό,τι ο διαχειριστής κλάδου, μόνο στον κλάδο του', () => {
    const p = stelexos(stelexosGrants([{ klados: 'POULIA', isArchigos: true, duties: [] }]));
    expect(can(p, 'drasi:write', 'POULIA')).toBe(true);
    expect(can(p, 'meloi:manage', 'POULIA')).toBe(true);
    expect(can(p, 'drasi:write', 'ODIGOI')).toBe(false);
    // Τα επιπέδου Τοπικού μένουν στον υπερδιαχειριστή.
    expect(can(p, 'accounts:manage')).toBe(false);
  });

  it('βλέπει μόνο τους κλάδους όπου είναι στέλεχος', () => {
    const p = stelexos(stelexosGrants([{ klados: 'ASTERIA', isArchigos: false, duties: [] }]));
    expect(visibleKladoi(p, ['ASTERIA', 'POULIA', 'ODIGOI', 'MEGALOI_ODIGOI'])).toEqual(['ASTERIA']);
    expect(canAccessKlados(p, 'POULIA')).toBe(false);
  });

  it('χωρίς memberships: τίποτα', () => {
    const p = stelexos({});
    expect(can(p, 'calendar:read')).toBe(false);
    expect(visibleKladoi(p, ['ODIGOI'])).toEqual([]);
  });
});
