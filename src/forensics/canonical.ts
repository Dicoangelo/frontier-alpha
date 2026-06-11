/**
 * Deterministic JSON canonicalization shared by the forensic primitives
 * (ForensicChain, ForensicSeal). Object keys are sorted recursively so the
 * same logical value always hashes/signs identically regardless of
 * construction order. Dependency-free on purpose: seals must be verifiable
 * in contexts with no database configured.
 */

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
