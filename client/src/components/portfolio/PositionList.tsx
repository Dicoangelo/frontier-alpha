import { Card } from '@/components/shared/Card';
import { Badge } from '@/components/shared/Badge';
import type { Position, Quote } from '@/types';

interface PositionListProps {
  positions: Position[];
  quotes?: Map<string, Quote>;
}

export function PositionList({ positions, quotes }: PositionListProps) {
  return (
    <Card title="Holdings">
      <div className="space-y-3">
        {positions.map((position) => {
          const quote = quotes?.get(position.symbol);
          const changePercent = quote?.changePercent ?? 0;

          return (
            <div
              key={position.symbol}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold">
                  {position.symbol.slice(0, 2)}
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{position.symbol}</p>
                  <p className="text-sm text-gray-500">
                    {position.shares} shares • {(position.weight * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="font-semibold text-gray-800">
                  ${position.currentPrice.toFixed(2)}
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant={changePercent >= 0 ? 'success' : 'danger'}>
                    {changePercent >= 0 ? '↑' : '↓'} {Math.abs(changePercent).toFixed(2)}%
                  </Badge>
                </div>
              </div>

              <div className="text-right">
                <p className={`font-semibold ${position.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {position.unrealizedPnL >= 0 ? '+' : ''}${position.unrealizedPnL.toLocaleString()}
                </p>
                <p className="text-sm text-gray-500">
                  Cost: ${position.costBasis.toFixed(2)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
