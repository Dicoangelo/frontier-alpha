import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, Plus, Trash2, Copy, Check, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { api } from '@/api/client';
import { Card } from '@/components/shared/Card';
import { Button } from '@/components/shared/Button';
import { Spinner } from '@/components/shared/Spinner';
import { toast } from '@/components/shared/Toast';

// ============================================================================
// Types
// ============================================================================

interface APIKey {
  id: string;
  name: string;
  permissions: Record<string, boolean>;
  rate_limit: number;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  usage_count: number;
}

interface CreateKeyResponse {
  id: string;
  name: string;
  key: string;
  permissions: Record<string, boolean>;
  rate_limit: number;
  created_at: string;
}

// ============================================================================
// Component
// ============================================================================

export function APIKeys() {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyPermissions, setNewKeyPermissions] = useState<'read' | 'readwrite'>('read');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);
  const [visibleKeyIds, setVisibleKeyIds] = useState<Set<string>>(new Set());

  // Fetch API keys
  const { data: keysData, isLoading } = useQuery<{ data: APIKey[] }>({
    queryKey: ['api-keys'],
    queryFn: () => api.get('/api-keys'),
  });

  const keys = keysData?.data || [];
  const activeKeys = keys.filter((k) => !k.revoked_at);
  const revokedKeys = keys.filter((k) => k.revoked_at);

  // Create key mutation
  const createMutation = useMutation({
    mutationFn: (body: { name: string; permissions: Record<string, boolean> }) =>
      api.post('/api-keys', body) as Promise<{ data: CreateKeyResponse }>,
    onSuccess: (response) => {
      setCreatedKey(response.data.key);
      setShowCreateForm(false);
      setNewKeyName('');
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key created', `"${response.data.name}" is ready to use`);
    },
    onError: () => {
      toast.error('Failed to create API key');
    },
  });

  // Revoke key mutation
  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api-keys/${id}`),
    onSuccess: () => {
      setRevokeConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.warning('API key revoked');
    },
    onError: () => {
      toast.error('Failed to revoke API key');
    },
  });

  // Handlers
  const handleCreate = () => {
    if (!newKeyName.trim()) return;
    const permissions =
      newKeyPermissions === 'readwrite'
        ? { read: true, write: true }
        : { read: true, write: false };
    createMutation.mutate({ name: newKeyName.trim(), permissions });
  };

  const handleCopyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      // Fallback for non-HTTPS environments
      const textArea = document.createElement('textarea');
      textArea.value = key;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const maskKeyId = (id: string) => {
    return `fa_${'*'.repeat(28)}...${id.slice(-4)}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPermissions = (permissions: Record<string, boolean>) => {
    const perms: string[] = [];
    if (permissions.read) perms.push('Read');
    if (permissions.write) perms.push('Write');
    return perms.join(', ') || 'None';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Created key banner -- shown once after creation */}
      {createdKey && (
        <div className="p-4 rounded-lg border-2 border-[rgba(234, 179, 8,0.4)] bg-[rgba(234, 179, 8,0.05)]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[var(--color-warning)] mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[var(--color-warning)] mb-1">
                Save your API key now -- it will not be shown again
              </p>
              <div className="flex items-center gap-2 mt-2">
                <code className="flex-1 px-3 py-2 rounded bg-[var(--color-bg-tertiary)] text-sm font-mono text-[var(--color-text)] break-all select-all">
                  {createdKey}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleCopyKey(createdKey)}
                >
                  {copiedKey ? (
                    <Check className="w-4 h-4 text-[var(--color-positive)]" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copiedKey ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs"
                onClick={() => setCreatedKey(null)}
              >
                I have saved my key
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[var(--color-text-muted)]">
            Use API keys to access the Frontier Alpha API programmatically.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowCreateForm(true)}
          disabled={showCreateForm}
        >
          <Plus className="w-4 h-4" />
          Create Key
        </Button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <Card className="p-4 border border-[var(--color-border)]">
          <h4 className="font-medium mb-3">Create New API Key</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Key Name
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., Trading Bot, Portfolio Sync"
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-info)] bg-transparent"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') setShowCreateForm(false);
                }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1">
                Permissions
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setNewKeyPermissions('read')}
                  className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm transition ${
                    newKeyPermissions === 'read'
                      ? 'border-[var(--color-info)] bg-[rgba(59, 130, 246,0.1)] text-[var(--color-info)] dark:text-[var(--color-info)]'
                      : 'border-[var(--color-border)] hover:border-[var(--color-border)]'
                  }`}
                >
                  Read Only
                </button>
                <button
                  onClick={() => setNewKeyPermissions('readwrite')}
                  className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm transition ${
                    newKeyPermissions === 'readwrite'
                      ? 'border-[var(--color-info)] bg-[rgba(59, 130, 246,0.1)] text-[var(--color-info)] dark:text-[var(--color-info)]'
                      : 'border-[var(--color-border)] hover:border-[var(--color-border)]'
                  }`}
                >
                  Read &amp; Write
                </button>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewKeyName('');
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreate}
                disabled={!newKeyName.trim() || createMutation.isPending}
                isLoading={createMutation.isPending}
              >
                Create Key
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Active keys */}
      {activeKeys.length > 0 ? (
        <div className="space-y-2">
          {activeKeys.map((key) => (
            <div
              key={key.id}
              className="flex items-center gap-4 p-4 rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]"
            >
              <Key className="w-5 h-5 text-[var(--color-text-muted)] flex-shrink-0" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--color-text)]">{key.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(16, 185, 129,0.1)] text-[var(--color-positive)] dark:text-[var(--color-positive)]">
                    Active
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-xs font-mono text-[var(--color-text-muted)]">
                    {maskKeyId(key.id)}
                  </code>
                  <button
                    onClick={() => toggleKeyVisibility(key.id)}
                    className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition"
                    title={visibleKeyIds.has(key.id) ? 'Hide details' : 'Show details'}
                  >
                    {visibleKeyIds.has(key.id) ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {visibleKeyIds.has(key.id) && (
                  <div className="mt-2 text-xs text-[var(--color-text-muted)] space-y-1">
                    <p>Permissions: {formatPermissions(key.permissions)}</p>
                    <p>Rate Limit: {key.rate_limit.toLocaleString()} req/min</p>
                    <p>Created: {formatDate(key.created_at)}</p>
                    <p>Last Used: {formatDate(key.last_used_at)}</p>
                    <p>Requests: {key.usage_count.toLocaleString()}</p>
                  </div>
                )}
              </div>

              {/* Revoke button */}
              {revokeConfirmId === key.id ? (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-[var(--color-negative)]">Revoke?</span>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => revokeMutation.mutate(key.id)}
                    isLoading={revokeMutation.isPending}
                  >
                    Yes
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRevokeConfirmId(null)}
                  >
                    No
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRevokeConfirmId(key.id)}
                  className="text-[var(--color-negative)] hover:text-[var(--color-negative)] flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        !showCreateForm && (
          <div className="text-center py-8 text-[var(--color-text-muted)]">
            <Key className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No API keys yet.</p>
            <p className="text-xs mt-1">
              Create an API key to access the Frontier Alpha API from your applications.
            </p>
          </div>
        )
      )}

      {/* Revoked keys (collapsed) */}
      {revokedKeys.length > 0 && (
        <details className="mt-4">
          <summary className="text-sm text-[var(--color-text-muted)] cursor-pointer hover:text-[var(--color-text-secondary)] select-none">
            {revokedKeys.length} revoked key{revokedKeys.length === 1 ? '' : 's'}
          </summary>
          <div className="mt-2 space-y-2">
            {revokedKeys.map((key) => (
              <div
                key={key.id}
                className="flex items-center gap-4 p-3 rounded-lg bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] opacity-50"
              >
                <Key className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-[var(--color-text-muted)] line-through">
                    {key.name}
                  </span>
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-[rgba(239, 68, 68,0.1)] text-[var(--color-negative)]">
                    Revoked
                  </span>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    Revoked {formatDate(key.revoked_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Usage hint */}
      <div className="text-xs text-[var(--color-text-muted)] mt-4 p-3 rounded-lg bg-[var(--color-bg-tertiary)]">
        <p className="font-medium mb-1">Usage</p>
        <code className="block">
          curl -H &quot;X-API-Key: fa_your_key_here&quot; {window.location.origin}/api/v1/portfolio
        </code>
        <p className="mt-2">
          Or use the <code className="text-[var(--color-text-secondary)]">Authorization: Bearer fa_...</code> header.
        </p>
      </div>
    </div>
  );
}
