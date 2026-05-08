import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Server, Link2, Unlink, ExternalLink } from 'lucide-react';
import { api } from '@/api/client';
import { useToast } from '@/hooks/useToast';
import { useSubscription } from '@/hooks/useSubscription';

interface BrokerStatus {
  broker: 'simulated' | 'alpaca' | 'mock';
  source: 'user' | 'env' | 'simulated';
  isPaper: boolean;
  lastVerifiedAt: string | null;
}

interface ConnectResponse {
  broker: 'alpaca';
  isPaper: boolean;
  accountStatus: string;
}

const inputClass =
  'block w-full px-4 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-[border-color,box-shadow] duration-200 mono text-sm';

const labelClass =
  'block text-[10px] mono tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-2';

export function BrokerSection() {
  const { plan } = useSubscription();
  const isPro = plan === 'pro' || plan === 'enterprise';

  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [isPaper, setIsPaper] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { toastSuccess, toastError } = useToast();
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery<BrokerStatus>({
    queryKey: ['broker', 'status'],
    queryFn: async () => {
      const res = (await api.get('/broker/status')) as { data: BrokerStatus };
      return res.data;
    },
    enabled: isPro,
    staleTime: 30_000,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = (await api.post('/broker/connect', {
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        isPaper,
      })) as { data: ConnectResponse };
      return res.data;
    },
    onSuccess: () => {
      setApiKey('');
      setApiSecret('');
      setError(null);
      toastSuccess('Alpaca connected', { message: `Paper trading: ${isPaper ? 'on' : 'off'}` });
      queryClient.invalidateQueries({ queryKey: ['broker', 'status'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setError(msg);
      toastError('Could not connect Alpaca', { message: msg });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = (await api.post('/broker/disconnect', {})) as { data: { broker: string } };
      return res.data;
    },
    onSuccess: () => {
      toastSuccess('Alpaca disconnected', { message: 'Now using internal SimulatedBroker' });
      queryClient.invalidateQueries({ queryKey: ['broker', 'status'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Disconnect failed';
      toastError('Could not disconnect', { message: msg });
    },
  });

  // ── Free user — gate behind upgrade prompt ────────────────────────────
  if (!isPro) {
    return (
      <div className="glass-slab-floating relative overflow-hidden rounded-2xl px-6 py-8 text-center">
        <div className="sovereign-bar absolute top-0 left-0 right-0" />
        <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-2">
          Pro Plan · Required
        </p>
        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">
          Connect your Alpaca account
        </h3>
        <p className="text-sm text-[var(--color-text-secondary)] mb-5 leading-relaxed max-w-md mx-auto">
          Pro users can route trades through their personal Alpaca paper or live account.
          Free tier uses Frontier Alpha&apos;s internal simulated broker.
        </p>
        <a
          href="/pricing"
          className="inline-block px-6 py-3 bg-[image:var(--gradient-sovereign)] text-white rounded-sm mono text-[10px] font-black tracking-[0.3em] uppercase animate-press animate-lift shadow-[0_4px_20px_rgba(123,44,255,0.3)] hover:brightness-110"
        >
          Upgrade to Pro →
        </a>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="glass-slab rounded-2xl p-6">
        <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-text-muted)]">
          Loading broker status…
        </p>
      </div>
    );
  }

  const isUserConnected = status?.source === 'user';

  // ── Connected — show status + disconnect ──────────────────────────────
  if (isUserConnected) {
    return (
      <div className="space-y-4">
        <div className="glass-slab-floating rounded-2xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-1">
              Broker · Connected
            </p>
            <p className="font-semibold text-[var(--color-text)]">
              Alpaca {status.isPaper ? 'Paper' : 'Live'}
            </p>
            {status.lastVerifiedAt && (
              <p className="mono text-[9px] tracking-[0.2em] uppercase text-[var(--color-text-muted)] mt-1 tabular-nums">
                Verified {new Date(status.lastVerifiedAt).toLocaleString()}
              </p>
            )}
          </div>
          <button
            onClick={() => disconnectMutation.mutate()}
            disabled={disconnectMutation.isPending}
            className="px-4 py-2 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] hover:border-[var(--color-negative)]/50 text-[var(--color-text-secondary)] hover:text-[var(--color-negative)] rounded-sm mono text-[10px] font-bold tracking-[0.3em] uppercase animate-press transition-[border-color,color] duration-200 disabled:opacity-50 flex items-center gap-2"
          >
            <Unlink className="w-3.5 h-3.5" />
            {disconnectMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>

        <p className="mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-text-muted)]">
          Trades route through your personal Alpaca account.
          Disconnect to fall back to the internal simulated broker.
        </p>
      </div>
    );
  }

  // ── Not connected — show form ─────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="glass-slab rounded-xl p-4 flex items-start gap-3">
        <Server className="w-4 h-4 text-[var(--color-accent-secondary)] mt-0.5 flex-shrink-0" />
        <div className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          <p className="mb-1">
            Currently using <span className="text-[var(--color-text)] font-medium">Frontier Alpha&apos;s simulated broker</span>.
            Connect Alpaca to route trades through your personal account.
          </p>
          <a
            href="https://app.alpaca.markets/paper/dashboard/overview"
            target="_blank"
            rel="noopener noreferrer"
            className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-accent-secondary)] hover:text-[var(--color-accent)] transition-colors inline-flex items-center gap-1"
          >
            Get keys at Alpaca <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      <div>
        <label htmlFor="alpaca-key" className={labelClass}>
          API Key ID
        </label>
        <input
          id="alpaca-key"
          type="text"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="PK..."
          className={inputClass}
          autoComplete="off"
        />
      </div>

      <div>
        <label htmlFor="alpaca-secret" className={labelClass}>
          Secret
        </label>
        <input
          id="alpaca-secret"
          type="password"
          value={apiSecret}
          onChange={(e) => setApiSecret(e.target.value)}
          placeholder="••••••••"
          className={inputClass}
          autoComplete="off"
        />
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={isPaper}
          onChange={(e) => setIsPaper(e.target.checked)}
          className="w-4 h-4 accent-[var(--color-accent)]"
        />
        <span className="text-sm text-[var(--color-text)]">
          Paper trading <span className="mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-text-muted)] ml-1">(recommended)</span>
        </span>
      </label>

      {!isPaper && (
        <div className="glass-slab-floating relative overflow-hidden rounded-lg pl-4 pr-3 py-3 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-warning)]">
          <p className="mono text-[10px] tracking-[0.3em] uppercase text-[var(--color-warning)] mb-1">
            Live Trading · Real Money
          </p>
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
            Orders will execute against your real Alpaca account using actual capital.
          </p>
        </div>
      )}

      {error && (
        <div className="glass-slab-floating relative overflow-hidden rounded-lg pl-4 pr-3 py-3 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-negative)] shadow-[0_8px_30px_-10px_rgba(239,68,68,0.35)]">
          <p className="text-sm text-[var(--color-negative)] font-medium">{error}</p>
        </div>
      )}

      <button
        onClick={() => connectMutation.mutate()}
        disabled={!apiKey || !apiSecret || connectMutation.isPending}
        className="px-6 py-3 bg-[image:var(--gradient-sovereign)] text-white rounded-sm mono text-[10px] font-black tracking-[0.3em] uppercase animate-press animate-lift disabled:opacity-50 disabled:hover:translate-y-0 shadow-[0_4px_20px_rgba(123,44,255,0.3)] hover:brightness-110 flex items-center gap-2"
      >
        <Link2 className="w-3.5 h-3.5" />
        {connectMutation.isPending ? 'Connecting…' : 'Connect Alpaca'}
      </button>
    </div>
  );
}
