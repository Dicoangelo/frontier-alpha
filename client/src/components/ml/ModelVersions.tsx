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
      bgColor: 'color-mix(in srgb, var(--color-positive) 10%, transparent)',
      borderColor: 'color-mix(in srgb, var(--color-positive) 20%, transparent)',
    },
    validated: {
      label: 'Validated',
      color: 'var(--color-info)',
      bgColor: 'color-mix(in srgb, var(--color-info) 10%, transparent)',
      borderColor: 'color-mix(in srgb, var(--color-info) 20%, transparent)',
    },
    training: {
      label: 'Training',
      color: 'var(--color-warning)',
      bgColor: 'color-mix(in srgb, var(--color-warning) 10%, transparent)',
      borderColor: 'color-mix(in srgb, var(--color-warning) 20%, transparent)',
    },
    archived: {
      label: 'Archived',
      color: 'var(--color-text-muted)',
      bgColor: 'color-mix(in srgb, var(--color-text-muted) 10%, transparent)',
      borderColor: 'color-mix(in srgb, var(--color-text-muted) 20%, transparent)',
    },
  };
  const c = config[status];
  return (
    <span
      className="px-2 py-0.5 text-xs font-medium rounded-full border"
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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
          <Cpu className="w-5 h-5 text-[var(--color-accent)]" />
          Model Performance
        </h2>
        <span className="text-sm text-[var(--color-text-muted)]">
          {deployedModels.length} deployed
        </span>
      </div>

      {/* Model Cards */}
      <div className="space-y-3">
        {displayModels.map((model) => (
          <div
            key={model.id}
            className="p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] hover:shadow-md transition-all duration-200 hover:border-[var(--color-accent)]"
            style={{ '--tw-border-opacity': '0.3' } as React.CSSProperties}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--color-text)]">
                  {model.modelType === 'regime_detector' ? 'Regime Detector' : 'Neural Factor'}
                </span>
                <span className="text-xs text-[var(--color-text-muted)] font-mono">v{model.version}</span>
                <StatusBadge status={model.status} />
              </div>
              <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                <Clock className="w-3 h-3" />
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
                <div className="text-xs text-[var(--color-text-muted)]">Accuracy</div>
                <div className="text-sm font-bold text-[var(--color-text)]">
                  {(model.accuracy * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--color-text-muted)]">Sharpe +</div>
                <div className="text-sm font-bold text-[var(--color-positive)]">
                  +{(model.sharpeImprovement * 100).toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--color-text-muted)]">DD Reduction</div>
                <div className="text-sm font-bold text-[var(--color-info)]">
                  -{(model.maxDrawdownReduction * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            {/* Accuracy Bar */}
            <div className="mt-3 h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${model.accuracy * 100}%`,
                  background: 'linear-gradient(to right, var(--color-accent), var(--chart-purple))',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {models.length > 3 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-3 w-full py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors flex items-center justify-center gap-1 hover:bg-[var(--color-bg-secondary)] rounded-lg"
        >
          {showAll ? (
            <>Show less <ChevronUp className="w-4 h-4" /></>
          ) : (
            <>Show all {models.length} versions <ChevronDown className="w-4 h-4" /></>
          )}
        </button>
      )}
    </Card>
  );
}

export const ModelVersions = React.memo(ModelVersionsInner);
export default ModelVersions;
