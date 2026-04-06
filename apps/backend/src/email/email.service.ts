import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('email.resendApiKey', '');
    this.from = this.configService.get<string>('email.fromAddress', 'Tandemu <notifications@tandemu.dev>');
    this.resend = apiKey ? new Resend(apiKey) : null;
  }

  async send(to: string | string[], subject: string, html: string): Promise<void> {
    if (!this.resend) return;

    const recipients = Array.isArray(to) ? to : [to];
    try {
      await this.resend.emails.send({
        from: this.from,
        to: recipients,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${recipients.join(', ')}: ${subject}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${recipients.join(', ')}: ${subject}`, error);
      throw error;
    }
  }
}
