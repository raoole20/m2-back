import { registerAs } from '@nestjs/config';

export default registerAs('mailer', () => ({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '1025', 10),
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || '',
  password: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || 'M2 <no-reply@localhost>',
  frontendUrl: process.env.APP_FRONTEND_URL || 'http://localhost:3001',
  emailVerificationTtlHours: parseInt(
    process.env.EMAIL_VERIFICATION_TTL_HOURS || '24',
    10,
  ),
  passwordResetTtlMinutes: parseInt(
    process.env.PASSWORD_RESET_TTL_MINUTES || '30',
    10,
  ),
}));
