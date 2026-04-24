import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';

import { MailerService } from '../../modules/mailer/mailer.service.js';

export interface VerificationEmailJobData {
  type: 'send-verification';
  email: string;
  name: string;
  rawToken: string;
  tenantSlug: string;
}

export interface PasswordResetEmailJobData {
  type: 'send-password-reset';
  email: string;
  name: string;
  rawToken: string;
  tenantSlug: string;
  ipAddress?: string;
  requestedAt: string;
}

export interface PasswordChangedEmailJobData {
  type: 'send-password-changed';
  email: string;
  name: string;
  ipAddress?: string;
  changedAt: string;
}

export type EmailJobData =
  | VerificationEmailJobData
  | PasswordResetEmailJobData
  | PasswordChangedEmailJobData;

@Processor('email')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly mailer: MailerService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    const frontendUrl = this.configService.get<string>(
      'mailer.frontendUrl',
      'http://localhost:3001',
    );

    try {
      switch (job.data.type) {
        case 'send-verification': {
          const ttlHours = this.configService.get<number>(
            'mailer.emailVerificationTtlHours',
            24,
          );
          const verifyUrl = `${frontendUrl}/verify-email?token=${job.data.rawToken}&tenant=${job.data.tenantSlug}`;
          await this.mailer.send({
            to: job.data.email,
            subject: 'Verify your email',
            template: 'verify-email',
            context: { name: job.data.name, verifyUrl, ttlHours },
          });
          break;
        }
        case 'send-password-reset': {
          const ttlMinutes = this.configService.get<number>(
            'mailer.passwordResetTtlMinutes',
            30,
          );
          const resetUrl = `${frontendUrl}/reset-password?token=${job.data.rawToken}&tenant=${job.data.tenantSlug}`;
          await this.mailer.send({
            to: job.data.email,
            subject: 'Reset your password',
            template: 'password-reset',
            context: {
              name: job.data.name,
              resetUrl,
              ttlMinutes,
              ipAddress: job.data.ipAddress ?? 'unknown',
              requestedAt: job.data.requestedAt,
            },
          });
          break;
        }
        case 'send-password-changed': {
          await this.mailer.send({
            to: job.data.email,
            subject: 'Your password was changed',
            template: 'password-changed',
            context: {
              name: job.data.name,
              changedAt: job.data.changedAt,
              ipAddress: job.data.ipAddress ?? 'unknown',
            },
          });
          break;
        }
      }
    } catch (error) {
      this.logger.error(
        `❌ Email job failed (${job.data.type}): ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }
}
