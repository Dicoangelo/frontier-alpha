/**
 * Re-export from canonical logger location.
 *
 * The pino-based structured logger lives in src/lib/logger.ts.
 * This file preserves backwards-compatibility for existing imports.
 */

export { logger } from '../lib/logger.js';
export type { Logger } from '../lib/logger.js';
