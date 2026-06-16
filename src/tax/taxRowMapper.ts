/**
 * Pure DB-row → TaxLotTracker mapping. No I/O, no supabase import — so it is
 * unit-testable without environment configuration. The async fetch wrapper
 * lives in `loadTrackerFromDb.ts`.
 */

import { TaxLotTracker, type TaxLot, type TaxEvent, type TaxEventType } from './TaxLotTracker.js';

/** Raw `frontier_tax_lots` row shape (snake_case, as Supabase returns it). */
export interface TaxLotRow {
  id: string;
  user_id: string;
  symbol: string;
  shares: number | string;
  cost_basis: number | string;
  purchase_date: string;
  sold_date: string | null;
}

/** Raw `frontier_tax_events` row shape (snake_case, as Supabase returns it). */
export interface TaxEventRow {
  id: string;
  user_id: string;
  tax_year: number;
  event_type: TaxEventType;
  symbol: string;
  realized_gain: number | string;
  is_wash_sale: boolean | null;
  tax_lot_id: string | null;
  shares: number | string | null;
  sale_price: number | string | null;
  cost_basis: number | string | null;
  sale_date: string | null;
}

/** Postgres numerics arrive as strings via PostgREST — coerce defensively. */
function num(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Pure mapper: build a hydrated TaxLotTracker from raw DB rows. No I/O.
 *
 * A tax event with no linked `tax_lot_id` (the common case for users whose
 * realized history was imported as events rather than reconstructed lot-by-lot)
 * keeps `taxLotId: null`; `getTaxSummary` / the report generator default those
 * to short-term, which is the conservative classification.
 */
export function mapTaxRowsToTracker(
  lotRows: TaxLotRow[],
  eventRows: TaxEventRow[],
): TaxLotTracker {
  const lots: TaxLot[] = lotRows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol.toUpperCase(),
    shares: num(row.shares),
    costBasis: num(row.cost_basis),
    purchaseDate: new Date(row.purchase_date),
    soldDate: row.sold_date ? new Date(row.sold_date) : null,
  }));

  const events: TaxEvent[] = eventRows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    taxYear: row.tax_year,
    eventType: row.event_type,
    symbol: row.symbol.toUpperCase(),
    realizedGain: num(row.realized_gain),
    isWashSale: Boolean(row.is_wash_sale),
    taxLotId: row.tax_lot_id,
    shares: num(row.shares),
    salePrice: num(row.sale_price),
    costBasis: num(row.cost_basis),
    // Events can in principle predate a recorded sale_date; fall back to epoch
    // only as a last resort so a malformed row never throws Invalid Date math.
    saleDate: row.sale_date ? new Date(row.sale_date) : new Date(0),
  }));

  const tracker = new TaxLotTracker();
  tracker.loadSnapshot({ lots, events });
  return tracker;
}
