import React from 'react';
import { Wallet, RefreshCw } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Badge } from '@/components/shared/Badge';
import type { BrokerAccount } from '@/hooks/useTrading';

interface AccountSummaryProps {
  account: BrokerAccount | undefined;
  accountLoading: boolean;
  brokerConnected: boolean;
  brokerType: string;
  paperTrading: boolean;
  isMarketOpen: boolean;
}

export const AccountSummary = React.memo(function AccountSummary({
  account,
  accountLoading,
  brokerConnected,
  brokerType,
  paperTrading,
  isMarketOpen,
}: AccountSummaryProps) {
  // Broker status — type rail (positive=connected, warning=paper/closed, negative=offline)
  const railColor = !brokerConnected
    ? 'var(--color-negative)'
    : !isMarketOpen
    ? 'var(--color-warning)'
    : 'var(--color-positive)';
  const railShadow = !brokerConnected
    ? 'shadow-[0_18px_60px_-20px_rgba(239,68,68,0.35)]'
    : !isMarketOpen
    ? 'shadow-[0_18px_60px_-20px_rgba(245,158,11,0.35)]'
    : 'shadow-[0_18px_60px_-20px_rgba(16,185,129,0.35)]';

  return (
    <Card className={`relative overflow-hidden p-4 ${railShadow}`}>
      <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: railColor }} />
      <div className="flex items-center justify-between mb-4 pl-2">
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted">
            Account
          </p>
          <h3 className="mt-1 text-lg font-semibold text-theme flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[var(--color-info)]" aria-hidden="true" />
            Broker Status
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={brokerConnected ? 'success' : 'warning'}>
            {brokerType === 'alpaca' ? 'Alpaca' : 'Demo'}
          </Badge>
          {paperTrading && <Badge variant="info">Paper Trading</Badge>}
          {!isMarketOpen && <Badge variant="neutral">Market Closed</Badge>}
        </div>
      </div>

      {accountLoading ? (
        <div className="flex items-center gap-2 mono text-xs tracking-[0.2em] uppercase text-theme-muted pl-2">
          <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" />
          Loading account...
        </div>
      ) : account ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-2">
          <div className="glass-slab-floating rounded-xl p-3">
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Buying Power</p>
            <p className="mt-1 mono text-lg font-semibold tabular-nums text-[var(--color-positive)]">
              ${account.buyingPower.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="glass-slab-floating rounded-xl p-3">
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Cash</p>
            <p className="mt-1 mono text-lg font-semibold tabular-nums text-theme">
              ${account.cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="glass-slab-floating rounded-xl p-3">
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Portfolio Value</p>
            <p className="mt-1 mono text-lg font-semibold tabular-nums text-theme">
              ${account.portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-theme-muted pl-2">Account info unavailable</p>
      )}
    </Card>
  );
});
