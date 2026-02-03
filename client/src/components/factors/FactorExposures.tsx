import { Card } from '@/components/shared/Card';
import { FactorBar } from './FactorBar';
import type { FactorExposure } from '@/types';

interface FactorExposuresProps {
  factors: FactorExposure[];
  insight?: string;
}

export function FactorExposures({ factors, insight }: FactorExposuresProps) {
  const sortedFactors = [...factors].sort((a, b) => Math.abs(b.exposure) - Math.abs(a.exposure));

  return (
    <Card title="Factor Exposures">
      <div className="space-y-4">
        {sortedFactors.map((factor) => (
          <FactorBar key={factor.factor} factor={factor} />
        ))}
      </div>

      {insight && (
        <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-800">
            <strong>AI Insight:</strong> {insight}
          </p>
        </div>
      )}
    </Card>
  );
}
