import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Κρυπτογράφηση μυστικών που πρέπει να ξαναδιαβάσουμε (π.χ. ο κωδικός e-SEO):
 * AES-256-GCM, με τυχαίο IV ανά τιμή και έλεγχο ακεραιότητας. Μορφή:
 * `v1.<iv>.<tag>.<κρυπτογράφημα>` σε base64url.
 *
 * Το κλειδί βγαίνει από το `SECRETS_KEY` — ή, αν λείπει, από το `DATABASE_URL`,
 * ώστε ένα dump της βάσης (backups, offsite) να μην αρκεί για να διαβαστούν.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = createHash('sha256').update(`trifylli:secret-box:${secret}`).digest();
  }

  static fromConfig(config: { SECRETS_KEY?: string; DATABASE_URL: string }): SecretBox {
    return new SecretBox(config.SECRETS_KEY ?? config.DATABASE_URL);
  }

  seal(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), data].map((part) => (typeof part === 'string' ? part : part.toString('base64url'))).join('.');
  }

  /** `null` όταν δεν ανοίγει — άλλο κλειδί ή αλλοιωμένη τιμή. */
  open(sealed: string): string | null {
    const [version, iv, tag, data] = sealed.split('.');
    if (version !== 'v1' || !iv || !tag || data === undefined) return null;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }
}
