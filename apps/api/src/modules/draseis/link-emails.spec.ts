import { describe, expect, it } from 'vitest';
import { linkEmail, linkRecipients } from './link-emails';

describe('σε ποιον πάει ο σύνδεσμος: σε όποιον υπογράφει', () => {
  it('ανήλικος: στους κηδεμόνες με email, χωρίς διπλά', () => {
    const child = {
      email: 'paidi@example.org',
      guardians: [{ email: 'mama@example.org' }, { email: ' Mama@Example.org ' }, { email: null }, { email: 'baba@example.org' }],
    };
    expect(linkRecipients(child, true)).toEqual(['mama@example.org', 'baba@example.org']);
  });

  it('ανήλικος χωρίς email κηδεμόνα: στο email της καρτέλας του', () => {
    expect(linkRecipients({ email: 'oikogeneia@example.org', guardians: [{ email: '' }] }, true)).toEqual(['oikogeneia@example.org']);
  });

  it('ενήλικος (και στέλεχος): στον ίδιο, όχι στους κηδεμόνες', () => {
    expect(linkRecipients({ email: 'stelexos@example.org', guardians: [{ email: 'mama@example.org' }] }, false)).toEqual(['stelexos@example.org']);
  });

  it('χωρίς έγκυρη διεύθυνση: κανένας', () => {
    expect(linkRecipients({ email: 'όχι-email', guardians: [] }, false)).toEqual([]);
    expect(linkRecipients({ email: null }, true)).toEqual([]);
  });
});

describe('το email με τον σύνδεσμο', () => {
  const base = {
    drasi: { title: 'Εκπαίδευση <Ενω/Υπο>', dateStart: new Date('2026-11-14T07:00:00Z'), dateEnd: new Date('2026-11-15T15:00:00Z'), location: 'Ελευσίνα' },
    topiko: 'Τ.Τ. Μεγάρων',
    participant: 'Παπά Ελένη',
    url: 'https://app.example.org/forms/abc',
    expiresAt: new Date('2026-12-14T10:00:00Z'),
  };

  it('δήλωση συμμετοχής: θέμα, δράση, ημερομηνίες, σύνδεσμος, λήξη', () => {
    const mail = linkEmail({ ...base, kind: 'SYMMETOXI' });
    expect(mail.subject).toBe('Δήλωση συμμετοχής — Εκπαίδευση <Ενω/Υπο>');
    expect(mail.text).toContain('14/11/2026 – 15/11/2026, Ελευσίνα');
    expect(mail.text).toContain('Παπά Ελένη');
    expect(mail.text).toContain('https://app.example.org/forms/abc');
    expect(mail.text).toContain('14/12/2026');
    expect(mail.text).toContain('Τ.Τ. Μεγάρων');
  });

  it('το HTML δεν περνά αυτούσιο ό,τι γράφτηκε στη δράση', () => {
    const mail = linkEmail({ ...base, kind: 'YGEIA' });
    expect(mail.subject).toBe('Πιστοποιητικό υγείας — Εκπαίδευση <Ενω/Υπο>');
    expect(mail.html).toContain('Εκπαίδευση &lt;Ενω/Υπο&gt;');
    expect(mail.html).not.toContain('<Ενω/Υπο>');
    expect(mail.html).toContain('href="https://app.example.org/forms/abc"');
  });

  it('αξιολόγηση: δικό της θέμα', () => {
    expect(linkEmail({ ...base, kind: 'REVIEW' }).subject).toBe('Αξιολόγηση — Εκπαίδευση <Ενω/Υπο>');
  });
});
