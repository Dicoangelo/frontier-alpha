/**
 * OptionsChain — Chain table with calls left, puts right, strike center.
 * Extracted from Options.tsx (Story UXR2-004).
 */

import React, { useState, useMemo } from 'react';
import { Layers, ChevronDown } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import type { ChainContract } from './options-types';
import {
  UNDERLYING_PRICE,
  UNDERLYING_SYMBOL,
  EXPIRATIONS,
  EXPIRATION_LABELS,
  daysToExpiry,
  formatVolume,
} from './options-types';

interface OptionsChainProps {
  contracts: ChainContract[];
}

function OptionsChainInner({ contracts }: OptionsChainProps) {
  const [selectedExp, setSelectedExp] = useState(EXPIRATIONS[0]);

  const calls = useMemo(
    () => contracts.filter((c) => c.type === 'call' && c.expiration === selectedExp),
    [contracts, selectedExp]
  );
  const puts = useMemo(
    () => contracts.filter((c) => c.type === 'put' && c.expiration === selectedExp),
    [contracts, selectedExp]
  );
  const strikes = useMemo(
    () => [...new Set(calls.map((c) => c.strike))].sort((a, b) => a - b),
    [calls]
  );

  const callsByStrike = useMemo(() => {
    const map = new Map<number, ChainContract>();
    for (const c of calls) map.set(c.strike, c);
    return map;
  }, [calls]);

  const putsByStrike = useMemo(() => {
    const map = new Map<number, ChainContract>();
    for (const p of puts) map.set(p.strike, p);
    return map;
  }, [puts]);

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
          <Layers className="w-5 h-5 text-[var(--color-accent)]" />
          Options Chain
          <span className="text-sm font-normal text-[var(--color-text-muted)]">
            {UNDERLYING_SYMBOL} @ ${UNDERLYING_PRICE.toFixed(2)}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <label htmlFor="chain-exp" className="text-sm text-[var(--color-text-muted)]">Expiry:</label>
          <div className="relative">
            <select
              id="chain-exp"
              value={selectedExp}
              onChange={(e) => setSelectedExp(e.target.value)}
              className="appearance-none bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-2 pr-8 text-sm text-[var(--color-text)] min-h-[44px] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
            >
              {EXPIRATIONS.map((exp) => (
                <option key={exp} value={exp}>
                  {EXPIRATION_LABELS[exp]} ({daysToExpiry(exp)}d)
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto -mx-6 px-6 animate-fade-in">
        <table className="w-full text-sm" aria-label={`Options chain for ${UNDERLYING_SYMBOL}`}>
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th colSpan={5} className="text-center text-[var(--color-positive)] text-xs font-semibold pb-2 border-r border-[var(--color-border)]">
                CALLS
              </th>
              <th className="text-center text-xs font-semibold pb-2 text-[var(--color-text)] border-r border-[var(--color-border)]">
                STRIKE
              </th>
              <th colSpan={5} className="text-center text-[var(--color-negative)] text-xs font-semibold pb-2">
                PUTS
              </th>
            </tr>
            <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
              <th className="text-right px-2 py-2 text-xs">Bid</th>
              <th className="text-right px-2 py-2 text-xs">Ask</th>
              <th className="text-right px-2 py-2 text-xs">Last</th>
              <th className="text-right px-2 py-2 text-xs">Vol</th>
              <th className="text-right px-2 py-2 text-xs border-r border-[var(--color-border)]">OI</th>
              <th className="text-center px-2 py-2 text-xs border-r border-[var(--color-border)]" />
              <th className="text-right px-2 py-2 text-xs">Bid</th>
              <th className="text-right px-2 py-2 text-xs">Ask</th>
              <th className="text-right px-2 py-2 text-xs">Last</th>
              <th className="text-right px-2 py-2 text-xs">Vol</th>
              <th className="text-right px-2 py-2 text-xs">OI</th>
            </tr>
          </thead>
          <tbody>
            {strikes.map((strike) => {
              const call = callsByStrike.get(strike);
              const put = putsByStrike.get(strike);
              const isITMCall = strike < UNDERLYING_PRICE;
              const isITMPut = strike > UNDERLYING_PRICE;
              const isATM = Math.abs(strike - UNDERLYING_PRICE) <= 1.25;

              return (
                <tr
                  key={strike}
                  className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                  style={isATM ? { backgroundColor: 'color-mix(in srgb, var(--color-accent) 5%, transparent)' } : undefined}
                >
                  {/* Call side */}
                  <td
                    className="text-right px-2 py-2 font-mono text-xs"
                    style={isITMCall ? { backgroundColor: 'color-mix(in srgb, var(--color-positive) 5%, transparent)' } : undefined}
                  >
                    {call?.bid.toFixed(2)}
                  </td>
                  <td
                    className="text-right px-2 py-2 font-mono text-xs"
                    style={isITMCall ? { backgroundColor: 'color-mix(in srgb, var(--color-positive) 5%, transparent)' } : undefined}
                  >
                    {call?.ask.toFixed(2)}
                  </td>
                  <td
                    className="text-right px-2 py-2 font-mono text-xs font-medium"
                    style={isITMCall ? { backgroundColor: 'color-mix(in srgb, var(--color-positive) 5%, transparent)' } : undefined}
                  >
                    {call?.last.toFixed(2)}
                  </td>
                  <td
                    className="text-right px-2 py-2 font-mono text-xs text-[var(--color-text-muted)]"
                    style={isITMCall ? { backgroundColor: 'color-mix(in srgb, var(--color-positive) 5%, transparent)' } : undefined}
                  >
                    {call ? formatVolume(call.volume) : ''}
                  </td>
                  <td
                    className="text-right px-2 py-2 font-mono text-xs text-[var(--color-text-muted)] border-r border-[var(--color-border)]"
                    style={isITMCall ? { backgroundColor: 'color-mix(in srgb, var(--color-positive) 5%, transparent)' } : undefined}
                  >
                    {call ? formatVolume(call.openInterest) : ''}
                  </td>

                  {/* Strike */}
                  <td className={`text-center px-3 py-2 font-mono text-xs font-bold border-r border-[var(--color-border)] ${
                    isATM ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'
                  }`}>
                    {strike.toFixed(1)}
                  </td>

                  {/* Put side */}
                  <td
                    className="text-right px-2 py-2 font-mono text-xs"
                    style={isITMPut ? { backgroundColor: 'color-mix(in srgb, var(--color-negative) 5%, transparent)' } : undefined}
                  >
                    {put?.bid.toFixed(2)}
                  </td>
                  <td
                    className="text-right px-2 py-2 font-mono text-xs"
                    style={isITMPut ? { backgroundColor: 'color-mix(in srgb, var(--color-negative) 5%, transparent)' } : undefined}
                  >
                    {put?.ask.toFixed(2)}
                  </td>
                  <td
                    className="text-right px-2 py-2 font-mono text-xs font-medium"
                    style={isITMPut ? { backgroundColor: 'color-mix(in srgb, var(--color-negative) 5%, transparent)' } : undefined}
                  >
                    {put?.last.toFixed(2)}
                  </td>
                  <td
                    className="text-right px-2 py-2 font-mono text-xs text-[var(--color-text-muted)]"
                    style={isITMPut ? { backgroundColor: 'color-mix(in srgb, var(--color-negative) 5%, transparent)' } : undefined}
                  >
                    {put ? formatVolume(put.volume) : ''}
                  </td>
                  <td
                    className="text-right px-2 py-2 font-mono text-xs text-[var(--color-text-muted)]"
                    style={isITMPut ? { backgroundColor: 'color-mix(in srgb, var(--color-negative) 5%, transparent)' } : undefined}
                  >
                    {put ? formatVolume(put.openInterest) : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
        <span className="flex items-center gap-1">
          <span
            className="w-3 h-3 rounded"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-positive) 20%, transparent)', border: '1px solid color-mix(in srgb, var(--color-positive) 30%, transparent)' }}
          />
          ITM Calls
        </span>
        <span className="flex items-center gap-1">
          <span
            className="w-3 h-3 rounded"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-negative) 20%, transparent)', border: '1px solid color-mix(in srgb, var(--color-negative) 30%, transparent)' }}
          />
          ITM Puts
        </span>
        <span className="flex items-center gap-1">
          <span
            className="w-3 h-3 rounded"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 20%, transparent)', border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)' }}
          />
          ATM
        </span>
      </div>
    </Card>
  );
}

export const OptionsChain = React.memo(OptionsChainInner);
export default OptionsChain;
