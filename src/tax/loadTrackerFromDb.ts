/**
 * Tax tracker hydration — DB rows → in-memory TaxLotTracker.
 *
 * The TaxLotTracker / HarvestingScanner / WashSaleDetector / TaxReportGenerator
 * engines all operate against an in-memory `TaxLotTracker`. The shared instance
 * built in `buildApp()` starts empty and is never populated from the database,
 * so before this loader existed the report / harvest / wash-sale routes always
 * returned zeros for real users — every realized lot lives in Supabase
 * (`frontier_tax_lots` + `frontier_tax_events`), not in process memory.
 *
 * This module is the missing seam. `mapTaxRowsToTracker` is a pure function
 * (testable without a database) that turns raw rows into a hydrated tracker;
 * `hydrateTaxTracker` is the thin async wrapper that fetches a user's rows via
 * the service-role client and delegates to the mapper.
 */

import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../observability/logger.js';
import { mapTaxRowsToTracker, type TaxLotRow, type TaxEventRow } from './taxRowMapper.js';
import type { TaxLotTracker } from './TaxLotTracker.js';

export { mapTaxRowsToTracker } from './taxRowMapper.js';
export type { TaxLotRow, TaxEventRow } from './taxRowMapper.js';

/**
 * Fetch a user's persisted tax lots + events and return a hydrated tracker.
 *
 * On any query error the loader logs and returns an empty tracker rather than
 * throwing — a tax report degrading to "no realized activity" is a far better
 * failure mode than a 500 on the page. Callers that need to distinguish the two
 * can pass their own error handling, but the routes intentionally treat an
 * empty tracker as a valid (if uninteresting) state.
 */
export async function hydrateTaxTracker(userId: string): Promise<TaxLotTracker> {
  const [lotsResult, eventsResult] = await Promise.all([
    supabaseAdmin.from('frontier_tax_lots').select('*').eq('user_id', userId),
    supabaseAdmin.from('frontier_tax_events').select('*').eq('user_id', userId),
  ]);

  if (lotsResult.error) {
    logger.error({ err: lotsResult.error }, 'hydrateTaxTracker: failed to load tax lots');
  }
  if (eventsResult.error) {
    logger.error({ err: eventsResult.error }, 'hydrateTaxTracker: failed to load tax events');
  }

  return mapTaxRowsToTracker(
    (lotsResult.data as TaxLotRow[] | null) ?? [],
    (eventsResult.data as TaxEventRow[] | null) ?? [],
  );
}
