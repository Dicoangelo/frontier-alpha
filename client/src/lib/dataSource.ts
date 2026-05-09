/**
 * DataSource<T> — type-level mock-data integrity contract (US-002, P1)
 *
 * Every authed component must accept its data wrapped in a `DataSource<T>`
 * discriminated union. This makes "raw demo number leaking through" a
 * compile-time error rather than a runtime audit.
 *
 *   - kind: 'real'  — live, user-owned numbers; render as-is
 *   - kind: 'empty' — no data yet (fresh user, no positions, etc.); render
 *                     placeholders or empty-state UI
 *   - kind: 'demo'  — fixture / preview / fallback data; MUST be paired with
 *                     a `<MockDataBanner>` so the user sees the source
 *
 * Components are free to keep additional flags (loading, error) on top of
 * this contract. The contract is exclusively about the *meaning* of a
 * numeric value: did it come from the user's real data, or not?
 */

export type DataSource<T> =
  | { kind: 'real'; value: T }
  | { kind: 'empty' }
  | { kind: 'demo'; value: T };

/**
 * Helpers — keep import sites short and the discriminated union ergonomic.
 */

export const EMPTY: { kind: 'empty' } = { kind: 'empty' };

export function wrapReal<T>(value: T): DataSource<T> {
  return { kind: 'real', value };
}

export function wrapDemo<T>(value: T): DataSource<T> {
  return { kind: 'demo', value };
}

export function isReal<T>(
  ds: DataSource<T>,
): ds is { kind: 'real'; value: T } {
  return ds.kind === 'real';
}

export function isDemo<T>(
  ds: DataSource<T>,
): ds is { kind: 'demo'; value: T } {
  return ds.kind === 'demo';
}

export function isEmpty<T>(ds: DataSource<T>): ds is { kind: 'empty' } {
  return ds.kind === 'empty';
}

/**
 * Unwrap with a fallback — useful when a component needs *some* numeric
 * value to drive a layout (e.g., chart height) but should branch on `kind`
 * for what to actually render. The fallback is the empty placeholder.
 */
export function unwrapOrEmpty<T>(ds: DataSource<T>, empty: T): T {
  return ds.kind === 'empty' ? empty : ds.value;
}

/**
 * Unwrap to T or undefined — convenient when the component wants to render
 * `—` placeholders for empty without inventing a synthetic zero.
 */
export function unwrapOrUndefined<T>(ds: DataSource<T>): T | undefined {
  return ds.kind === 'empty' ? undefined : ds.value;
}
