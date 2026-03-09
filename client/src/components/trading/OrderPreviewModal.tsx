import React from 'react';
import { X, AlertCircle, AlertTriangle, Zap } from 'lucide-react';
import { Card } from '@/components/shared/Card';
import { Badge } from '@/components/shared/Badge';
import { Button } from '@/components/shared/Button';
import type { OrderPreview, OrderValidation } from '@/hooks/useTrading';

interface OrderPreviewModalProps {
  preview: OrderPreview;
  validation: OrderValidation | null;
  side: 'buy' | 'sell';
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const OrderPreviewModal = React.memo(function OrderPreviewModal({
  preview,
  validation,
  side,
  isSubmitting,
  onClose,
  onConfirm,
}: OrderPreviewModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[var(--color-text)]">Order Preview</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[var(--color-bg-secondary)] rounded"
          >
            <X className="w-5 h-5 text-[var(--color-text-muted)]" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Order Summary */}
          <div className="p-4 bg-[var(--color-bg-tertiary)] rounded-lg space-y-2">
            <div className="flex justify-between">
              <span className="text-[var(--color-text-secondary)]">Symbol</span>
              <span className="font-semibold">{preview.symbol}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-secondary)]">Side</span>
              <Badge variant={preview.side === 'buy' ? 'success' : 'danger'}>
                {preview.side.toUpperCase()}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-secondary)]">Quantity</span>
              <span className="font-semibold">{preview.qty}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-secondary)]">Order Type</span>
              <span className="font-semibold capitalize">{preview.type}</span>
            </div>
          </div>

          {/* Price Details */}
          <div className="p-4 border border-[var(--color-border)] rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">Current Price</span>
              <span>${preview.currentPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">Estimated Price</span>
              <span>${preview.estimatedPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">Estimated Cost</span>
              <span>${preview.estimatedCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">Fees</span>
              <span>${preview.estimatedFees.toFixed(2)}</span>
            </div>
            {preview.slippageEstimate > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-secondary)]">Est. Slippage</span>
                <span className="text-[var(--color-warning)]">${preview.slippageEstimate.toFixed(2)}</span>
              </div>
            )}
            <hr className="my-2" />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>${preview.estimatedTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Market Impact */}
          <div className="flex items-center gap-2">
            <Zap className={`w-4 h-4 ${
              preview.marketImpact === 'high' ? 'text-[var(--color-negative)]' :
              preview.marketImpact === 'medium' ? 'text-[var(--color-warning)]' :
              'text-[var(--color-positive)]'
            }`} />
            <span className="text-sm text-[var(--color-text-secondary)]">
              Market Impact: <span className="font-medium capitalize">{preview.marketImpact}</span>
            </span>
          </div>

          {/* Validation */}
          {validation && (
            <>
              {validation.errors.length > 0 && (
                <div
                  className="p-3 rounded-lg"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-negative) 10%, transparent)' }}
                >
                  {validation.errors.map((error, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-[var(--color-negative)]">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  ))}
                </div>
              )}

              {validation.warnings.length > 0 && (
                <div
                  className="p-3 rounded-lg space-y-1"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--color-warning) 10%, transparent)' }}
                >
                  {validation.warnings.map((warning, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm text-[var(--color-warning)]">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant={side === 'buy' ? 'primary' : 'danger'}
              onClick={onConfirm}
              disabled={!!(validation && !validation.valid)}
              isLoading={isSubmitting}
              className="flex-1"
            >
              Confirm {side === 'buy' ? 'Buy' : 'Sell'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
});
