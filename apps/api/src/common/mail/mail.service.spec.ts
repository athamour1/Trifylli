import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../config/configuration';
import { MailService } from './mail.service';

const config = (over: Partial<AppConfig>) => ({ SMTP_USE_TLS: true, SMTP_USE_SSL: false, ...over }) as AppConfig;

describe('MailService', () => {
  it('χωρίς SMTP_HOST ή SMTP_FROM δεν στέλνει — και το λέει', async () => {
    for (const c of [config({}), config({ SMTP_HOST: 'smtp.example.org' }), config({ SMTP_FROM: 'Trifylli <noreply@example.org>' })]) {
      const mail = new MailService(c);
      expect(mail.enabled).toBe(false);
      await expect(mail.send({ to: ['a@example.org'], subject: 'x', text: 'y' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    }
  });

  it('με host και αποστολέα είναι ενεργό', () => {
    expect(new MailService(config({ SMTP_HOST: 'smtp.example.org', SMTP_FROM: 'Trifylli <noreply@example.org>' })).enabled).toBe(true);
  });
});
