import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/shared/Button';
import { Spinner } from '@/components/shared/Spinner';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface LoginFormProps {
  onSwitchToSignup: () => void;
}

export function LoginForm({ onSwitchToSignup }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const { login, loading, error, clearError } = useAuthStore();

  const validateEmail = (value: string) => {
    if (value && !EMAIL_RE.test(value)) {
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
          className={`block w-full px-4 py-3 bg-[var(--color-bg-tertiary)] border rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-[border-color,box-shadow] duration-200 mono text-sm ${
            emailError ? 'border-[var(--color-negative)]' : 'border-[var(--color-border)]'
          }`}
          placeholder="you@example.com"
        />
        {emailError && (
          <p className="mt-1 text-xs text-[var(--color-negative)] mono">{emailError}</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="password" className="block text-[10px] mono tracking-[0.3em] uppercase text-[var(--color-text-muted)]">
            Password
          </label>
          <Link
            to="/reset-password"
            className="text-[10px] mono tracking-[0.2em] uppercase text-[var(--color-accent-secondary)] hover:text-[var(--color-accent)] transition-colors"
          >
            Forgot?
          </Link>
        </div>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="current-password"
          className="block w-full px-4 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)] transition-[border-color,box-shadow] duration-200 mono text-sm"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <div className="glass-slab-floating relative overflow-hidden rounded-lg pl-4 pr-3 py-3 before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[var(--color-negative)] shadow-[0_8px_30px_-10px_rgba(239,68,68,0.35)]">
          <p className="text-sm text-[var(--color-negative)] font-medium">{error}</p>
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
          className="text-[var(--color-accent-secondary)] hover:text-[var(--color-accent)] font-medium transition-colors animate-press"
        >
          Sign up
        </button>
      </p>
    </form>
  );
}
