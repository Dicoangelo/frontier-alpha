import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/shared/Button';
import { Spinner } from '@/components/shared/Spinner';

interface LoginFormProps {
  onSwitchToSignup: () => void;
}

export function LoginForm({ onSwitchToSignup }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await login(email, password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="email" className="block text-[10px] mono tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-2">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="block w-full px-4 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-all mono text-sm"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-[10px] mono tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-2">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="block w-full px-4 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-all mono text-sm"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <div className="p-3 rounded-sm" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: '1px', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
          <p className="text-sm text-[var(--color-negative)] mono">{error}</p>
        </div>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? <Spinner className="w-5 h-5" /> : 'Sign In'}
      </Button>

      <p className="text-center text-sm text-[var(--color-text-muted)]">
        Don't have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignup}
          className="text-[var(--color-accent-secondary)] hover:text-[var(--color-accent)] font-medium transition-colors"
        >
          Sign up
        </button>
      </p>
    </form>
  );
}
