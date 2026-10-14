import { describe, expect, it } from 'vitest';
import type { DrasiExternalView } from '@trifylli/shared';
import { externalStelexosOption, looksLikeEmail } from '../src/components/drasi/types';

const ext = (over: Partial<DrasiExternalView>): DrasiExternalView => ({
  userId: 'u1',
  firstName: 'Νταμης',
  lastName: 'Νταμόπουλος',
  email: null,
  phone: null,
  origin: 'Ελευσίνα',
  active: false,
  account: true,
  roles: [],
  ...over,
});

describe('externalStelexosOption', () => {
  it('στέλεχος με λογαριασμό: εξωτερικό, με την προέλευσή του', () => {
    expect(externalStelexosOption(ext({}))).toEqual({ label: 'Νταμόπουλος Νταμης', value: 'u1', caption: 'Εξωτερικό · Ελευσίνα' });
  });

  it('στέλεχος χωρίς λογαριασμό: φαίνεται στον επιλογέα ότι δεν μπαίνει στην εφαρμογή', () => {
    expect(externalStelexosOption(ext({ account: false })).caption).toBe('Χωρίς πρόσβαση · Ελευσίνα');
  });
});

describe('looksLikeEmail', () => {
  it('δέχεται κανονικό email', () => {
    expect(looksLikeEmail(' maria@example.gr ')).toBe(true);
  });

  it('κόβει μισά ή με κενά — αλλιώς ο χρήστης βλέπει μόνο το αγγλικό λάθος του API', () => {
    for (const bad of ['maria@', 'maria@example', 'maria example@x.gr', '@example.gr']) expect(looksLikeEmail(bad)).toBe(false);
  });
});
