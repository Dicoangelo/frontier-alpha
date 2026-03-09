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
  const [emailError, setEmailError] = useState('');
  const { login, loading, error, clearError } = useAuthStore();

  const validateEmail = (value: string) => {
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError('Please enter a valid email address');
    } else {
      setEmailError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emailError) return;
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
          onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
          onBlur={(e) => validateEmail(e.target.value)}
          required
          autoFocus
          autoComplete="email"
          className={`block w-full px-4 py-3 bg-[var(--color-bg-tertiary)] border rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-all mono text-sm ${
            emailError ? 'border-[var(--color-negative)]' : 'border-[var(--color-border)]'
          }`}
          placeholder="you@example.com"
        />
        {emailError && (
          <p className="mt-1 text-xs text-[var(--color-negative)] mono">{emailError}</p>
        )}
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
          autoComplete="current-password"
          className="block w-full px-4 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-all mono text-sm"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <div className="p-3 rounded-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--color-negative) 10%, transparent)', borderWidth: '1px', borderColor: 'color-mix(in srgb, var(--color-negative) 20%, transparent)' }}>
          <p className="text-sm text-[var(--color-negative)] mono">{error}</p>
        </div>
      )}

      <Button type="submit" disabled={loading || !!emailError} className="w-full">
        {loading ? <><Spinner className="w-5 h-5 inline mr-2" />Signing in...</> : 'Sign In'}
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
