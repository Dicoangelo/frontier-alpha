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
  const impactColor =
    preview.marketImpact === 'high'
      ? 'var(--color-negative)'
      : preview.marketImpact === 'medium'
      ? 'var(--color-warning)'
      : 'var(--color-positive)';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md p-6 relative overflow-hidden">
        <div className="sovereign-bar absolute left-0 right-0 top-0" aria-hidden="true" />
        <div className="flex items-center justify-between mb-4 pt-1">
          <div>
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">
              Preview
            </p>
            <h3 className="mt-0.5 text-lg font-semibold text-theme">Order Preview</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 min-h-[36px] min-w-[36px] hover:bg-[var(--color-bg-secondary)] rounded-lg animate-press transition-[background-color] duration-200"
            aria-label="Close order preview"
          >
            <X className="w-5 h-5 text-theme-muted" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Order Summary */}
          <div className="glass-slab-floating rounded-xl p-4 space-y-2">
            <div className="flex justify-between">
              <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Symbol</span>
              <span className="font-semibold text-theme">{preview.symbol}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Side</span>
              <Badge variant={preview.side === 'buy' ? 'success' : 'danger'}>
                {preview.side.toUpperCase()}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Quantity</span>
              <span className="mono font-semibold tabular-nums text-theme">{preview.qty}</span>
            </div>
            <div className="flex justify-between">
              <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Order Type</span>
              <span className="font-semibold capitalize text-theme">{preview.type}</span>
            </div>
          </div>

          {/* Price Details */}
          <div className="glass-slab-floating rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Current Price</span>
              <span className="mono tabular-nums text-theme">${preview.currentPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Estimated Price</span>
              <span className="mono tabular-nums text-theme">${preview.estimatedPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Estimated Cost</span>
              <span className="mono tabular-nums text-theme">${preview.estimatedCost.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Fees</span>
              <span className="mono tabular-nums text-theme">${preview.estimatedFees.toFixed(2)}</span>
            </div>
            {preview.slippageEstimate > 0 && (
              <div className="flex justify-between text-sm">
                <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Est. Slippage</span>
                <span className="mono tabular-nums text-[var(--color-warning)]">${preview.slippageEstimate.toFixed(2)}</span>
              </div>
            )}
            <hr className="my-2 border-theme-light" />
            <div className="flex justify-between font-semibold">
              <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme">Total</span>
              <span className="mono text-base tabular-nums text-theme">${preview.estimatedTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Market Impact */}
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4" style={{ color: impactColor }} aria-hidden="true" />
            <span className="mono text-[10px] tracking-[0.2em] uppercase text-theme-secondary">
              Market Impact: <span className="font-medium capitalize" style={{ color: impactColor }}>{preview.marketImpact}</span>
            </span>
          </div>

          {/* Validation */}
          {validation && (
            <>
              {validation.errors.length > 0 && (
                <div
                  className="glass-slab-floating relative overflow-hidden p-3 pl-5 rounded-xl before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] space-y-1 bg-[var(--color-negative)]/8"
                >
                  <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--color-negative)]" />
                  {validation.errors.map((error, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm leading-relaxed text-[var(--color-negative)]">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  ))}
                </div>
              )}

              {validation.warnings.length > 0 && (
                <div
                  className="glass-slab-floating relative overflow-hidden p-3 pl-5 rounded-xl before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] space-y-1 bg-[var(--color-warning)]/8"
                >
                  <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--color-warning)]" />
                  {validation.warnings.map((warning, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm leading-relaxed text-[var(--color-warning)]">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
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
              className="flex-1 animate-press"
            >
              Cancel
            </Button>
            <Button
              variant={side === 'buy' ? 'primary' : 'danger'}
              onClick={onConfirm}
              disabled={!!(validation && !validation.valid)}
              isLoading={isSubmitting}
              className={`flex-1 animate-press animate-lift ${side === 'buy' ? 'bg-[image:var(--gradient-sovereign)]' : ''}`}
            >
              Confirm {side === 'buy' ? 'Buy' : 'Sell'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
});
