import { describe, it, expect } from 'vitest';
import { mapTaxRowsToTracker, type TaxLotRow, type TaxEventRow } from './taxRowMapper.js';
import { TaxLotTracker } from './TaxLotTracker.js';

const USER = 'user-123';
const YEAR = new Date().getUTCFullYear();

/** Mirrors the golden-state seed in tests/integration/auth-helper.ts. */
function goldenEventRows(): TaxEventRow[] {
  return [
    {
      id: 'evt-nvda',
      user_id: USER,
      tax_year: YEAR,
      event_type: 'realized_gain',
      symbol: 'NVDA',
      realized_gain: 1250.5,
      is_wash_sale: false,
      tax_lot_id: null,
      shares: 5,
      sale_price: 730,
      cost_basis: 480.5,
      sale_date: new Date(Date.UTC(YEAR, 0, 15)).toISOString(),
    },
    {
      id: 'evt-aapl',
      user_id: USER,
      tax_year: YEAR,
      event_type: 'realized_loss',
      symbol: 'AAPL',
      realized_gain: -425.75,
      is_wash_sale: false,
      tax_lot_id: null,
      shares: 10,
      sale_price: 132.7,
      cost_basis: 175.25,
      sale_date: new Date(Date.UTC(YEAR, 1, 22)).toISOString(),
    },
  ];
}

describe('mapTaxRowsToTracker', () => {
  it('hydrates a tracker whose summary reflects the golden realized events', () => {
    const tracker = mapTaxRowsToTracker([], goldenEventRows());
    const summary = tracker.getTaxSummary(USER, YEAR);

    expect(summary.eventCount).toBe(2);
    // No linked lot → defaults to short-term classification.
    expect(summary.shortTermGains).toBeCloseTo(1250.5, 2);
    expect(summary.shortTermLosses).toBeCloseTo(-425.75, 2);
    expect(summary.totalRealizedGain).toBeCloseTo(824.75, 2);
    expect(summary.longTermGains).toBe(0);
    expect(summary.washSaleAdjustment).toBe(0);
  });

  it('produces Form 8949-ready events for the report generator', () => {
    const tracker = mapTaxRowsToTracker([], goldenEventRows());
    const events = tracker.getEvents(USER, YEAR);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.symbol).sort()).toEqual(['AAPL', 'NVDA']);
    expect(events.every((e) => e.saleDate instanceof Date)).toBe(true);
  });

  it('coerces PostgREST numeric strings to numbers', () => {
    const rows: TaxEventRow[] = [
      {
        id: 'evt-str',
        user_id: USER,
        tax_year: YEAR,
        event_type: 'realized_gain',
        symbol: 'msft',
        realized_gain: '300.25' as unknown as number,
        is_wash_sale: null,
        tax_lot_id: null,
        shares: '3' as unknown as number,
        sale_price: '410.00' as unknown as number,
        cost_basis: '310.00' as unknown as number,
        sale_date: new Date(Date.UTC(YEAR, 2, 1)).toISOString(),
      },
    ];
    const summary = mapTaxRowsToTracker([], rows).getTaxSummary(USER, YEAR);
    expect(summary.shortTermGains).toBeCloseTo(300.25, 2);
    // Symbol is upper-cased on the way in.
    expect(mapTaxRowsToTracker([], rows).getEvents(USER).at(0)?.symbol).toBe('MSFT');
  });

  it('maps open lots so the harvest scanner can see them', () => {
    const lotRows: TaxLotRow[] = [
      {
        id: 'lot-open',
        user_id: USER,
        symbol: 'INTC',
        shares: 50,
        cost_basis: 42.8,
        purchase_date: new Date(Date.UTC(YEAR - 1, 5, 1)).toISOString(),
        sold_date: null,
      },
      {
        id: 'lot-closed',
        user_id: USER,
        symbol: 'BA',
        shares: 10,
        cost_basis: 248.6,
        purchase_date: new Date(Date.UTC(YEAR - 2, 5, 1)).toISOString(),
        sold_date: new Date(Date.UTC(YEAR, 0, 1)).toISOString(),
      },
    ];
    const tracker = mapTaxRowsToTracker(lotRows, []);
    expect(tracker.getAllLots(USER)).toHaveLength(2);
    const open = tracker.getOpenLots(USER);
    expect(open).toHaveLength(1);
    expect(open[0].symbol).toBe('INTC');
    expect(open[0].soldDate).toBeNull();
  });

  it('returns an empty summary when there is no persisted activity', () => {
    const summary = mapTaxRowsToTracker([], []).getTaxSummary(USER, YEAR);
    expect(summary.eventCount).toBe(0);
    expect(summary.totalRealizedGain).toBe(0);
  });
});

describe('TaxLotTracker.loadSnapshot', () => {
  it('replaces existing state and advances nextId past loaded numeric ids', () => {
    const tracker = new TaxLotTracker();
    // Seed some native state first to prove loadSnapshot replaces it.
    tracker.addLot(USER, 'AAPL', 10, 100, new Date(Date.UTC(YEAR - 1, 0, 1)));

    tracker.loadSnapshot({
      lots: [
        {
          id: 'tl_7',
          userId: USER,
          symbol: 'NVDA',
          shares: 5,
          costBasis: 480.5,
          purchaseDate: new Date(Date.UTC(YEAR - 1, 0, 1)),
          soldDate: null,
        },
      ],
      events: [],
    });

    expect(tracker.getAllLots(USER)).toHaveLength(1);
    expect(tracker.getAllLots(USER)[0].symbol).toBe('NVDA');

    // A subsequent native add must not collide with tl_7.
    const added = tracker.addLot(USER, 'MSFT', 1, 300, new Date(Date.UTC(YEAR - 1, 0, 1)));
    expect(added.id).toBe('tl_8');
  });
});
