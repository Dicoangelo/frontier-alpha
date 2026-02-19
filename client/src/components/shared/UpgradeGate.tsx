import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { Button } from './Button';

interface UpgradeGateProps {
  feature: 'optimizer' | 'backtest' | 'options' | 'ml' | 'tax' | 'apiAccess';
  children: React.ReactNode;
}

const FEATURE_LABELS: Record<string, string> = {
  optimizer: 'Portfolio Optimizer',
  backtest: 'Backtesting',
  options: 'Options Analysis',
  ml: 'ML Regime Detection',
  tax: 'Tax Optimization',
  apiAccess: 'API Access',
};

export function UpgradeGate({ feature, children }: UpgradeGateProps) {
  const { canAccess } = useSubscription();
  const navigate = useNavigate();

  if (canAccess(feature)) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div className="blur-sm pointer-events-none select-none" aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-bg)]/80 backdrop-blur-sm rounded-lg">
        <div className="text-center p-8 max-w-sm">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--color-accent)]/10 flex items-center justify-center">
            <Lock className="w-6 h-6 text-[var(--color-accent)]" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">
            {FEATURE_LABELS[feature] || feature} is a Premium Feature
          </h3>
          <p className="text-sm text-[var(--color-text-muted)] mb-6">
            Upgrade your plan to unlock {FEATURE_LABELS[feature]?.toLowerCase() || feature} and other advanced features.
          </p>
          <Button onClick={() => navigate('/pricing')}>
            View Plans
          </Button>
        </div>
      </div>
    </div>
  );
}
