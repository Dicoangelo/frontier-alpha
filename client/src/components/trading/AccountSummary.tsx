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
  error?: string;
  onRetry?: () => void;
}

export const AccountSummary = React.memo(function AccountSummary({
  account,
  accountLoading,
  brokerConnected,
  brokerType,
  paperTrading,
  isMarketOpen,
  error,
  onRetry,
}: AccountSummaryProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4 pl-2">
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted">
            Account
          </p>
          <h3 className="mt-1 text-lg font-semibold text-theme flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[var(--color-info)]" aria-hidden="true" />
            Account summary
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={brokerConnected ? 'success' : 'warning'}>
            {brokerConnected ? (brokerType === 'alpaca' ? 'Alpaca' : 'Paper account') : 'Not connected'}
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
      ) : error ? (
        <div role="alert" className="workspace-inline-error">{error}
          {onRetry && <button type="button" className="ml-2 underline" onClick={onRetry}>Retry account</button>}
        </div>
      ) : account ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pl-2">
          <div className="glass-slab-floating rounded-xl p-3">
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Buying Power</p>
            <p className="mt-1 mono text-lg font-semibold tabular-nums text-theme">
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
