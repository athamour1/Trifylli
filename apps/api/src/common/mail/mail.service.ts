import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfigToken } from '../config/config.module';
import type { AppConfig } from '../config/configuration';

export interface MailMessage {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  /** Οι απαντήσεις πάνε σε όποιον το έστειλε, όχι στο noreply. */
  replyTo?: string;
}

/**
 * Λεπτό wrapper πάνω στο SMTP, με τις ίδιες ρυθμίσεις που έχει το Authentik.
 * Χωρίς SMTP_HOST/SMTP_FROM δεν στέλνει τίποτα: `enabled` = false και η σελίδα
 * κρύβει το «Αποστολή email».
 */
@Injectable()
export class MailService {
  private readonly transport: Transporter | null;
  private readonly from: string | null;

  constructor(@Inject(AppConfigToken) config: AppConfig) {
    this.from = config.SMTP_FROM ?? null;
    if (config.SMTP_HOST && this.from) {
      const timeout = (config.SMTP_TIMEOUT ?? 30) * 1000;
      this.transport = createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT ?? (config.SMTP_USE_SSL ? 465 : 587),
        secure: config.SMTP_USE_SSL,
        requireTLS: config.SMTP_USE_TLS,
        auth: config.SMTP_USERNAME ? { user: config.SMTP_USERNAME, pass: config.SMTP_PASSWORD ?? '' } : undefined,
        connectionTimeout: timeout,
        greetingTimeout: timeout,
        socketTimeout: timeout,
      });
    } else {
      this.transport = null;
    }
  }

  get enabled(): boolean {
    return this.transport !== null;
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transport || !this.from) {
      throw new ServiceUnavailableException('Η αποστολή email δεν έχει ρυθμιστεί στον server (SMTP).');
    }
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      replyTo: message.replyTo,
    });
  }
}
