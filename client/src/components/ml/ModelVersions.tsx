/**
 * ModelVersions — Model comparison table with status badges and metrics.
 * Extracted from ML.tsx (Story UXR2-005).
 */

import React, { useState } from 'react';
import { Cpu, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/shared/Card';

// ── Types ──────────────────────────────────────────────────────

type ModelStatus = 'training' | 'validated' | 'deployed' | 'archived';

export interface ModelVersion {
  id: string;
  modelType: 'regime_detector' | 'neural_factor';
  version: string;
  status: ModelStatus;
  accuracy: number;
  sharpeImprovement: number;
  maxDrawdownReduction: number;
  trainedAt: string;
  deployedAt: string | null;
}

// ── Helper ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ModelStatus }) {
  type StatusStyle = { label: string; color: string; bgColor: string; borderColor: string };
  const config: Record<ModelStatus, StatusStyle> = {
    deployed: {
      label: 'Deployed',
      color: 'var(--color-positive)',
      bgColor: 'color-mix(in srgb, var(--color-positive) 12%, transparent)',
      borderColor: 'color-mix(in srgb, var(--color-positive) 24%, transparent)',
    },
    validated: {
      label: 'Validated',
      color: 'var(--color-info)',
      bgColor: 'color-mix(in srgb, var(--color-info) 12%, transparent)',
      borderColor: 'color-mix(in srgb, var(--color-info) 24%, transparent)',
    },
    training: {
      label: 'Training',
      color: 'var(--color-warning)',
      bgColor: 'color-mix(in srgb, var(--color-warning) 12%, transparent)',
      borderColor: 'color-mix(in srgb, var(--color-warning) 24%, transparent)',
    },
    archived: {
      label: 'Archived',
      color: 'var(--color-text-muted)',
      bgColor: 'color-mix(in srgb, var(--color-text-muted) 12%, transparent)',
      borderColor: 'color-mix(in srgb, var(--color-text-muted) 24%, transparent)',
    },
  };
  const c = config[status];
  return (
    <span
      className="px-2 py-0.5 mono text-[10px] tracking-[0.3em] uppercase font-medium rounded-full border"
      style={{ color: c.color, backgroundColor: c.bgColor, borderColor: c.borderColor }}
    >
      {c.label}
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────

interface ModelVersionsProps {
  models: ModelVersion[];
}

function ModelVersionsInner({ models }: ModelVersionsProps) {
  const [showAll, setShowAll] = useState(false);

  const deployedModels = models.filter((m) => m.status === 'deployed');
  const displayModels = showAll ? models : models.slice(0, 3);

  return (
    <Card>
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="mono text-[10px] sm:text-xs tracking-[0.3em] uppercase text-theme-muted mb-2">
            Model Registry
          </p>
          <h2 className="text-lg font-semibold text-theme flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[var(--color-accent)]" aria-hidden="true" />
            Model Performance
          </h2>
        </div>
        <span className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted tabular-nums">
          {deployedModels.length} deployed
        </span>
      </div>

      {/* Model Cards */}
      <div className="space-y-3 animate-stagger">
        {displayModels.map((model) => (
          <div
            key={model.id}
            className="glass-slab-floating rounded-xl p-4 animate-enter transition-[border-color,box-shadow] duration-200 hover:shadow-md"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-theme">
                  {model.modelType === 'regime_detector' ? 'Regime Detector' : 'Neural Factor'}
                </span>
                <span className="mono text-[10px] tracking-[0.2em] uppercase text-theme-muted tabular-nums">
                  v{model.version}
                </span>
                <StatusBadge status={model.status} />
              </div>
              <div className="flex items-center gap-1 mono text-[10px] tracking-[0.2em] uppercase text-theme-muted tabular-nums">
                <Clock className="w-3 h-3" aria-hidden="true" />
                {new Date(model.trainedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Accuracy</p>
                <p className="text-sm font-bold text-theme tabular-nums mt-0.5">
                  {(model.accuracy * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">Sharpe Δ</p>
                <p className="text-sm font-bold text-[var(--color-positive)] tabular-nums mt-0.5">
                  +{(model.sharpeImprovement * 100).toFixed(0)}%
                </p>
              </div>
              <div>
                <p className="mono text-[10px] tracking-[0.3em] uppercase text-theme-muted">DD Reduction</p>
                <p className="text-sm font-bold text-[var(--color-info)] tabular-nums mt-0.5">
                  -{(model.maxDrawdownReduction * 100).toFixed(0)}%
                </p>
              </div>
            </div>

            {/* Accuracy Bar */}
            <div className="mt-3 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-300 bg-[image:var(--gradient-sovereign)]"
                style={{ width: `${model.accuracy * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {models.length > 3 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-3 w-full py-2 mono text-[10px] tracking-[0.3em] uppercase text-theme-muted hover:text-theme glass-slab-floating rounded-lg flex items-center justify-center gap-1 animate-press transition-[color,background-color] duration-150"
          aria-expanded={showAll}
        >
          {showAll ? (
            <>Show less <ChevronUp className="w-4 h-4" aria-hidden="true" /></>
          ) : (
            <>Show all {models.length} versions <ChevronDown className="w-4 h-4" aria-hidden="true" /></>
          )}
        </button>
      )}
    </Card>
  );
}

export const ModelVersions = React.memo(ModelVersionsInner);
export default ModelVersions;
