import { describe, expect, it } from 'vitest';
import { emailCaption, linkToken } from '../src/lib/link-email';

describe('email συνδέσμων', () => {
  it('το token είναι το τελευταίο κομμάτι του συνδέσμου', () => {
    expect(linkToken('https://app.example.org/forms/AbC_d-123')).toBe('AbC_d-123');
    expect(linkToken('https://app.example.org/review/xyz/')).toBe('xyz');
  });

  it('η λεζάντα λέει σε ποιον πάει, πού πήγε ή γιατί όχι', () => {
    expect(emailCaption(['mama@example.org', 'baba@example.org'], undefined)).toEqual({ text: 'Email: mama@example.org, baba@example.org', tone: 'muted' });
    expect(emailCaption([], undefined)).toEqual({ text: 'Χωρίς email στην καρτέλα — αντίγραψε τον σύνδεσμο', tone: 'warning' });
    expect(emailCaption(['a@example.org'], { status: 'sent', to: ['a@example.org'] })).toEqual({ text: 'Στάλθηκε στο a@example.org', tone: 'positive' });
    expect(emailCaption(['a@example.org'], { status: 'error', error: 'Ο σύνδεσμος δεν ισχύει πια — βγάλε νέο.' })).toEqual({
      text: 'Ο σύνδεσμος δεν ισχύει πια — βγάλε νέο.',
      tone: 'negative',
    });
  });
});
