/**
 * Application Metrics for Frontier Alpha
 *
 * In-memory metrics collection with Prometheus-compatible text output.
 * Zero dependencies.
 *
 * Metric types:
 * - Counter  — monotonically increasing value (e.g. total requests)
 * - Gauge    — value that can go up or down  (e.g. active connections)
 * - Histogram — distribution of values with configurable buckets
 *
 * Tracked out-of-the-box:
 * - http_requests_total           (counter)
 * - http_request_duration_seconds (histogram)
 * - http_errors_total             (counter)
 * - active_connections            (gauge)
 * - cache_hits_total              (counter)
 * - cache_misses_total            (counter)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CounterData {
  type: 'counter';
  help: string;
  values: Map<string, number>; // labelKey -> value
}

interface GaugeData {
  type: 'gauge';
  help: string;
  values: Map<string, number>;
}

interface HistogramData {
  type: 'histogram';
  help: string;
  buckets: number[];
  /** Per-label series: counts per bucket, sum, count */
  series: Map<string, { bucketCounts: number[]; sum: number; count: number }>;
}

type MetricData = CounterData | GaugeData | HistogramData;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encode a label set as a stable, deterministic key for map lookups. */
function labelKey(labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return '';
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
}

function labelString(key: string): string {
  return key ? `{${key}}` : '';
}

const DEFAULT_HISTOGRAM_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

// ---------------------------------------------------------------------------
// MetricsRegistry
// ---------------------------------------------------------------------------

export class MetricsRegistry {
  private registry = new Map<string, MetricData>();

  // ---- registration -------------------------------------------------------

  registerCounter(name: string, help: string): void {
    if (!this.registry.has(name)) {
      this.registry.set(name, { type: 'counter', help, values: new Map() });
    }
  }

  registerGauge(name: string, help: string): void {
    if (!this.registry.has(name)) {
      this.registry.set(name, { type: 'gauge', help, values: new Map() });
    }
  }

  registerHistogram(name: string, help: string, buckets?: number[]): void {
    if (!this.registry.has(name)) {
      this.registry.set(name, {
        type: 'histogram',
        help,
        buckets: buckets ?? DEFAULT_HISTOGRAM_BUCKETS,
        series: new Map(),
      });
    }
  }

  // ---- mutation -----------------------------------------------------------

  incCounter(name: string, labels?: Record<string, string>, value: number = 1): void {
    const m = this.registry.get(name);
    if (!m || m.type !== 'counter') return;
    const key = labelKey(labels);
    m.values.set(key, (m.values.get(key) ?? 0) + value);
  }

  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const m = this.registry.get(name);
    if (!m || m.type !== 'gauge') return;
    m.values.set(labelKey(labels), value);
  }

  incGauge(name: string, labels?: Record<string, string>, delta: number = 1): void {
    const m = this.registry.get(name);
    if (!m || m.type !== 'gauge') return;
    const key = labelKey(labels);
    m.values.set(key, (m.values.get(key) ?? 0) + delta);
  }

  decGauge(name: string, labels?: Record<string, string>, delta: number = 1): void {
    this.incGauge(name, labels, -delta);
  }

  observeHistogram(name: string, value: number, labels?: Record<string, string>): void {
    const m = this.registry.get(name);
    if (!m || m.type !== 'histogram') return;

    const key = labelKey(labels);
    let series = m.series.get(key);
    if (!series) {
      series = { bucketCounts: new Array(m.buckets.length + 1).fill(0), sum: 0, count: 0 };
      m.series.set(key, series);
    }

    series.sum += value;
    series.count += 1;

    for (let i = 0; i < m.buckets.length; i++) {
      if (value <= m.buckets[i]) {
        series.bucketCounts[i]++;
      }
    }
    // +Inf bucket
    series.bucketCounts[m.buckets.length]++;
  }

  // ---- query --------------------------------------------------------------

  getCounter(name: string, labels?: Record<string, string>): number {
    const m = this.registry.get(name);
    if (!m || m.type !== 'counter') return 0;
    return m.values.get(labelKey(labels)) ?? 0;
  }

  getGauge(name: string, labels?: Record<string, string>): number {
    const m = this.registry.get(name);
    if (!m || m.type !== 'gauge') return 0;
    return m.values.get(labelKey(labels)) ?? 0;
  }

  // ---- Prometheus exposition format ---------------------------------------

  toPrometheus(): string {
    const lines: string[] = [];

    for (const [name, metric] of this.registry) {
      lines.push(`# HELP ${name} ${metric.help}`);
      lines.push(`# TYPE ${name} ${metric.type}`);

      if (metric.type === 'counter' || metric.type === 'gauge') {
        for (const [lk, val] of metric.values) {
          lines.push(`${name}${labelString(lk)} ${val}`);
        }
      } else if (metric.type === 'histogram') {
        for (const [lk, series] of metric.series) {
          const baseLabels = lk ? lk + ',' : '';
          for (let i = 0; i < metric.buckets.length; i++) {
            lines.push(`${name}_bucket{${baseLabels}le="${metric.buckets[i]}"} ${series.bucketCounts[i]}`);
          }
          lines.push(`${name}_bucket{${baseLabels}le="+Inf"} ${series.bucketCounts[metric.buckets.length]}`);
          lines.push(`${name}_sum${labelString(lk)} ${series.sum}`);
          lines.push(`${name}_count${labelString(lk)} ${series.count}`);
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  // ---- lifecycle ----------------------------------------------------------

  reset(): void {
    for (const metric of this.registry.values()) {
      if (metric.type === 'counter' || metric.type === 'gauge') {
        metric.values.clear();
      } else if (metric.type === 'histogram') {
        metric.series.clear();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Pre-registered application metrics (singleton)
// ---------------------------------------------------------------------------

export const metrics = new MetricsRegistry();

// HTTP
metrics.registerCounter('http_requests_total', 'Total number of HTTP requests');
metrics.registerHistogram(
  'http_request_duration_seconds',
  'HTTP request duration in seconds',
  [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
);
metrics.registerCounter('http_errors_total', 'Total number of HTTP errors');

// Connections
metrics.registerGauge('active_connections', 'Number of active connections');

// Cache
metrics.registerCounter('cache_hits_total', 'Total cache hits');
metrics.registerCounter('cache_misses_total', 'Total cache misses');

// ---------------------------------------------------------------------------
// Convenience helpers for common operations
// ---------------------------------------------------------------------------

export function recordRequest(method: string, route: string, status: number, durationSec: number): void {
  const labels = { method, route, status: String(status) };
  metrics.incCounter('http_requests_total', labels);
  metrics.observeHistogram('http_request_duration_seconds', durationSec, { method, route });

  if (status >= 400) {
    metrics.incCounter('http_errors_total', { method, route, status: String(status) });
  }
}

export function recordCacheHit(cache: string): void {
  metrics.incCounter('cache_hits_total', { cache });
}

export function recordCacheMiss(cache: string): void {
  metrics.incCounter('cache_misses_total', { cache });
}
