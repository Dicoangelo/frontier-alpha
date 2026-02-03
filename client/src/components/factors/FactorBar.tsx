import type { FactorExposure } from '@/types';

interface FactorBarProps {
  factor: FactorExposure;
}

export function FactorBar({ factor }: FactorBarProps) {
  const isPositive = factor.exposure >= 0;
  const barWidth = Math.min(Math.abs(factor.exposure) * 50, 50); // Max 50%

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-gray-700 capitalize">
          {factor.factor.replace(/_/g, ' ')}
        </span>
        <span className={`text-sm font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {isPositive ? '+' : ''}{factor.exposure.toFixed(2)}
        </span>
      </div>

      <div className="relative h-2 bg-gray-200 rounded-full">
        {/* Center line */}
        <div className="absolute top-0 left-1/2 w-0.5 h-full bg-gray-400 z-10" />

        {/* Bar */}
        <div
          className={`absolute top-0 h-full rounded-full transition-all duration-300 ${
            isPositive ? 'bg-green-500' : 'bg-red-500'
          }`}
          style={{
            left: isPositive ? '50%' : `${50 - barWidth}%`,
            width: `${barWidth}%`,
          }}
        />
      </div>

      <div className="flex justify-between text-xs text-gray-500">
        <span>t-stat: {factor.tStat.toFixed(2)}</span>
        <span>confidence: {(factor.confidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}
