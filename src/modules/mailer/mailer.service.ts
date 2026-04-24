import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

type TemplateName =
  | 'verify-email'
  | 'password-reset'
  | 'password-changed';

interface SendOptions {
  to: string;
  subject: string;
  template: TemplateName;
  context: Record<string, unknown>;
}

@Injectable()
export class MailerService implements OnModuleDestroy {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly templateCache = new Map<
    TemplateName,
    Handlebars.TemplateDelegate
  >();

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('mailer.host', 'localhost');
    const port = this.configService.get<number>('mailer.port', 1025);
    const secure = this.configService.get<boolean>('mailer.secure', false);
    const user = this.configService.get<string>('mailer.user', '');
    const password = this.configService.get<string>('mailer.password', '');
    this.from = this.configService.get<string>(
      'mailer.from',
      'M2 <no-reply@localhost>',
    );

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass: password } : undefined,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.transporter.close();
  }

  async send(options: SendOptions): Promise<void> {
    const html = this.renderTemplate(options.template, options.context);

    const info = await this.transporter.sendMail({
      from: this.from,
      to: options.to,
      subject: options.subject,
      html,
    });

    this.logger.log(
      `📧 Email sent to ${options.to} [${options.template}] messageId=${info.messageId}`,
    );
  }

  private renderTemplate(
    name: TemplateName,
    context: Record<string, unknown>,
  ): string {
    let compiled = this.templateCache.get(name);

    if (!compiled) {
      const templatePath = path.join(
        __dirname,
        'templates',
        `${name}.hbs`,
      );
      const source = fs.readFileSync(templatePath, 'utf-8');
      compiled = Handlebars.compile(source);
      this.templateCache.set(name, compiled);
    }

    return compiled(context);
  }
}
