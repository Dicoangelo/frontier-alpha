/**
 * Structured Logger — Pino-based logging for Frontier Alpha
 *
 * Features:
 * - JSON output in production, pretty-print in development
 * - Sensitive data redaction (emails, API keys, portfolio values, user IDs)
 * - Request correlation via requestId (child loggers)
 * - Service name and timestamp on every entry
 */

import pino from 'pino';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Paths to redact from log output.  Pino redaction uses fast-redact under the
 * hood so these are dot-notation paths applied to every serialized log entry.
 *
 * Wildcards:  `*.secret` redacts `secret` at any single depth.
 * We list both common nested paths and top-level keys.
 */
const REDACT_PATHS = [
  // Auth / credentials
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'key_hash',

  // PII / sensitive identifiers
  'email',
  'user_id',
  'userId',

  // Financial
  'portfolioValue',
  'portfolio_value',
  'cash_balance',
  'avg_cost',

  // Nested variants (single-level wildcard)
  '*.password',
  '*.token',
  '*.secret',
  '*.authorization',
  '*.cookie',
  '*.apiKey',
  '*.api_key',
  '*.accessToken',
  '*.access_token',
  '*.refreshToken',
  '*.refresh_token',
  '*.key_hash',
  '*.email',
  '*.user_id',
  '*.userId',
  '*.portfolioValue',
  '*.portfolio_value',
  '*.cash_balance',
  '*.avg_cost',
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (IS_PRODUCTION ? 'info' : 'debug'),

  // Service-wide default fields on every log line
  base: {
    service: 'frontier-alpha',
  },

  // ISO timestamp
  timestamp: pino.stdTimeFunctions.isoTime,

  // Redact sensitive data
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },

  // Pretty-print in development only
  transport: IS_PRODUCTION
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
});

export type { Logger } from 'pino';
