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
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted">
            Options Chain
          </p>
          <h2 className="mt-1 text-lg font-semibold text-theme flex items-center gap-2">
            <Layers className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
            <span>{UNDERLYING_SYMBOL}</span>
            <span className="mono text-xs tabular-nums text-theme-muted">
              @ ${UNDERLYING_PRICE.toFixed(2)}
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="chain-exp" className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">
            Expiry
          </label>
          <div className="relative">
            <select
              id="chain-exp"
              value={selectedExp}
              onChange={(e) => setSelectedExp(e.target.value)}
              className="appearance-none glass-slab-floating rounded-lg px-3 py-2 pr-8 text-sm text-theme min-h-[44px] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] animate-press transition-[border-color,box-shadow] duration-200"
            >
              {EXPIRATIONS.map((exp) => (
                <option key={exp} value={exp}>
                  {EXPIRATION_LABELS[exp]} ({daysToExpiry(exp)}d)
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-theme-muted pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="glass-slab-floating rounded-xl overflow-hidden">
        <div className="overflow-x-auto animate-fade-in">
          <table className="w-full text-sm" aria-label={`Options chain for ${UNDERLYING_SYMBOL}`}>
            <thead>
              <tr className="border-b border-theme-light">
                <th
                  colSpan={5}
                  className="text-center mono text-[10px] tracking-[0.3em] uppercase pt-3 pb-2 border-r border-theme-light"
                  style={{ color: 'var(--color-positive)' }}
                >
                  Calls
                </th>
                <th className="text-center mono text-[10px] tracking-[0.3em] uppercase pt-3 pb-2 text-theme border-r border-theme-light">
                  Strike
                </th>
                <th
                  colSpan={5}
                  className="text-center mono text-[10px] tracking-[0.3em] uppercase pt-3 pb-2"
                  style={{ color: 'var(--color-negative)' }}
                >
                  Puts
                </th>
              </tr>
              <tr className="border-b border-theme-light">
                <th className="text-right mono text-[10px] tracking-[0.2em] uppercase px-2 py-2 text-theme-muted">Bid</th>
                <th className="text-right mono text-[10px] tracking-[0.2em] uppercase px-2 py-2 text-theme-muted">Ask</th>
                <th className="text-right mono text-[10px] tracking-[0.2em] uppercase px-2 py-2 text-theme-muted">Last</th>
                <th className="text-right mono text-[10px] tracking-[0.2em] uppercase px-2 py-2 text-theme-muted">Vol</th>
                <th className="text-right mono text-[10px] tracking-[0.2em] uppercase px-2 py-2 text-theme-muted border-r border-theme-light">OI</th>
                <th className="text-center px-2 py-2 border-r border-theme-light" />
                <th className="text-right mono text-[10px] tracking-[0.2em] uppercase px-2 py-2 text-theme-muted">Bid</th>
                <th className="text-right mono text-[10px] tracking-[0.2em] uppercase px-2 py-2 text-theme-muted">Ask</th>
                <th className="text-right mono text-[10px] tracking-[0.2em] uppercase px-2 py-2 text-theme-muted">Last</th>
                <th className="text-right mono text-[10px] tracking-[0.2em] uppercase px-2 py-2 text-theme-muted">Vol</th>
                <th className="text-right mono text-[10px] tracking-[0.2em] uppercase px-2 py-2 text-theme-muted">OI</th>
              </tr>
            </thead>
            <tbody>
              {strikes.map((strike) => {
                const call = callsByStrike.get(strike);
                const put = putsByStrike.get(strike);
                const isITMCall = strike < UNDERLYING_PRICE;
                const isITMPut = strike > UNDERLYING_PRICE;
                const isATM = Math.abs(strike - UNDERLYING_PRICE) <= 1.25;

                const callTint = isITMCall
                  ? { backgroundColor: 'color-mix(in srgb, var(--color-positive) 6%, transparent)' }
                  : undefined;
                const putTint = isITMPut
                  ? { backgroundColor: 'color-mix(in srgb, var(--color-negative) 6%, transparent)' }
                  : undefined;

                return (
                  <tr
                    key={strike}
                    className="border-b border-theme-light hover:bg-[var(--color-bg-tertiary)] transition-colors duration-150"
                    style={isATM ? { backgroundColor: 'color-mix(in srgb, var(--color-accent) 6%, transparent)' } : undefined}
                  >
                    {/* Call side */}
                    <td className="text-right mono px-2 py-2 text-xs tabular-nums" style={callTint}>
                      {call?.bid.toFixed(2)}
                    </td>
                    <td className="text-right mono px-2 py-2 text-xs tabular-nums" style={callTint}>
                      {call?.ask.toFixed(2)}
                    </td>
                    <td
                      className="text-right mono px-2 py-2 text-xs font-medium tabular-nums"
                      style={callTint}
                    >
                      {call?.last.toFixed(2)}
                    </td>
                    <td className="text-right mono px-2 py-2 text-xs tabular-nums text-theme-muted" style={callTint}>
                      {call ? formatVolume(call.volume) : ''}
                    </td>
                    <td
                      className="text-right mono px-2 py-2 text-xs tabular-nums text-theme-muted border-r border-theme-light"
                      style={callTint}
                    >
                      {call ? formatVolume(call.openInterest) : ''}
                    </td>

                    {/* Strike */}
                    <td
                      className={`text-center mono px-3 py-2 text-xs font-bold tabular-nums border-r border-theme-light ${
                        isATM ? 'text-[var(--color-accent)]' : 'text-theme'
                      }`}
                    >
                      {strike.toFixed(1)}
                    </td>

                    {/* Put side */}
                    <td className="text-right mono px-2 py-2 text-xs tabular-nums" style={putTint}>
                      {put?.bid.toFixed(2)}
                    </td>
                    <td className="text-right mono px-2 py-2 text-xs tabular-nums" style={putTint}>
                      {put?.ask.toFixed(2)}
                    </td>
                    <td
                      className="text-right mono px-2 py-2 text-xs font-medium tabular-nums"
                      style={putTint}
                    >
                      {put?.last.toFixed(2)}
                    </td>
                    <td className="text-right mono px-2 py-2 text-xs tabular-nums text-theme-muted" style={putTint}>
                      {put ? formatVolume(put.volume) : ''}
                    </td>
                    <td className="text-right mono px-2 py-2 text-xs tabular-nums text-theme-muted" style={putTint}>
                      {put ? formatVolume(put.openInterest) : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 mono text-[10px] tracking-[0.2em] uppercase text-theme-muted">
        <span className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-positive) 20%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-positive) 30%, transparent)',
            }}
            aria-hidden="true"
          />
          ITM Calls
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-negative) 20%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-negative) 30%, transparent)',
            }}
            aria-hidden="true"
          />
          ITM Puts
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-accent) 20%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)',
            }}
            aria-hidden="true"
          />
          ATM
        </span>
      </div>
    </Card>
  );
}

export const OptionsChain = React.memo(OptionsChainInner);
export default OptionsChain;
