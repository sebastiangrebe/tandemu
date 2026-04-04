import * as Sentry from '@sentry/nestjs';

const dsn = process.env['SENTRY_BACKEND_DSN'] ?? '';
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env['NODE_ENV'] ?? 'development',
    tracesSampleRate: 1.0,
  });
} else {
  console.warn('SENTRY_BACKEND_DSN not set — Sentry error reporting disabled');
}
