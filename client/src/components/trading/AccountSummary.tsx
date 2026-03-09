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
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-[var(--color-info)]" />
          <h3 className="font-semibold text-[var(--color-text)]">Account</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={brokerConnected ? 'success' : 'warning'}>
            {brokerType === 'alpaca' ? 'Alpaca' : 'Demo'}
          </Badge>
          {paperTrading && (
            <Badge variant="info">Paper Trading</Badge>
          )}
          {!isMarketOpen && (
            <Badge variant="neutral">Market Closed</Badge>
          )}
        </div>
      </div>

      {accountLoading ? (
        <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Loading account...
        </div>
      ) : account ? (
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Buying Power</p>
            <p className="text-lg font-semibold text-[var(--color-positive)]">
              ${account.buyingPower.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Cash</p>
            <p className="text-lg font-semibold text-[var(--color-text)]">
              ${account.cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-muted)]">Portfolio Value</p>
            <p className="text-lg font-semibold text-[var(--color-text)]">
              ${account.portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-[var(--color-text-muted)]">Account info unavailable</p>
      )}
    </Card>
  );
});
