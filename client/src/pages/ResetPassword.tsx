import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, requestPasswordReset, updatePassword } from '@/lib/supabase';
import { Button } from '@/components/shared/Button';
import { Spinner } from '@/components/shared/Spinner';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = 'request' | 'recover' | 'done';

export function ResetPassword() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(() =>
    typeof window !== 'undefined' && window.location.hash.includes('type=recovery') ? 'recover' : 'request'
  );
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Detect PASSWORD_RECOVERY event — session may be set mid-flight
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('recover');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    setEmailError('');
    setError(null);
    setLoading(true);
    const { error: err } = await requestPasswordReset(email);
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setMessage('Check your inbox for a reset link. It can take a minute to arrive.');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError(null);
    setLoading(true);
    const { error: err } = await updatePassword(password);
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setMode('done');
      setTimeout(() => navigate('/dashboard'), 1500);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] grid-bg flex items-center justify-center p-4">
      <div className="sovereign-bar fixed top-0 left-0 right-0 z-50" />

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/metaventions-logo.png"
            alt="Metaventions AI"
            width={64}
            height={64}
            className="w-16 h-16 rounded-sm mx-auto mb-4"
          />
          <h1 className="text-3xl font-black text-[var(--color-text)]">
            Frontier <span className="text-gradient-brand">Alpha</span>
          </h1>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-2 mono tracking-[0.4em] uppercase">
            {mode === 'recover' ? 'Set a new password' : 'Password reset'}
          </p>
        </div>

        <div className="glass-slab rounded-sm p-8">
          {mode === 'request' && (
            <form onSubmit={handleRequest} className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-[var(--color-text)] mb-2">
                  Forgot your password?
                </h2>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Enter your account email and we&apos;ll send you a link to reset it.
                </p>
              </div>

              <div>
                <label htmlFor="reset-email" className="block text-[10px] mono tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-2">
                  Email
                </label>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
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

              {error && (
                <div className="p-3 rounded-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--color-negative) 10%, transparent)', borderWidth: '1px', borderColor: 'color-mix(in srgb, var(--color-negative) 20%, transparent)' }}>
                  <p className="text-sm text-[var(--color-negative)] mono">{error}</p>
                </div>
              )}

              {message && (
                <div className="p-3 rounded-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--color-positive) 10%, transparent)', borderWidth: '1px', borderColor: 'color-mix(in srgb, var(--color-positive) 20%, transparent)' }}>
                  <p className="text-sm text-[var(--color-positive)] mono">{message}</p>
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? <><Spinner className="w-5 h-5 inline mr-2" />Sending…</> : 'Send reset link'}
              </Button>

              <p className="text-center text-sm text-[var(--color-text-muted)]">
                Remembered?{' '}
                <Link
                  to="/login"
                  className="text-[var(--color-accent-secondary)] hover:text-[var(--color-accent)] font-medium transition-colors"
                >
                  Back to sign in
                </Link>
              </p>
            </form>
          )}

          {mode === 'recover' && (
            <form onSubmit={handleUpdate} className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-[var(--color-text)] mb-2">
                  Choose a new password
                </h2>
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Minimum 6 characters.
                </p>
              </div>

              <div>
                <label htmlFor="new-password" className="block text-[10px] mono tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-2">
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoFocus
                  autoComplete="new-password"
                  className="block w-full px-4 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-all mono text-sm"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-[10px] mono tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-2">
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className="block w-full px-4 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-all mono text-sm"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="p-3 rounded-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--color-negative) 10%, transparent)', borderWidth: '1px', borderColor: 'color-mix(in srgb, var(--color-negative) 20%, transparent)' }}>
                  <p className="text-sm text-[var(--color-negative)] mono">{error}</p>
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? <><Spinner className="w-5 h-5 inline mr-2" />Updating…</> : 'Update password'}
              </Button>
            </form>
          )}

          {mode === 'done' && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-sm flex items-center justify-center" style={{ backgroundColor: 'color-mix(in srgb, var(--color-positive) 15%, transparent)' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-positive)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-[var(--color-text)]">
                Password updated
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Taking you to your dashboard…
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-[9px] text-[var(--color-text-muted)] mt-6 mono tracking-[0.2em] uppercase">
          Metaventions AI · Architected Intelligence
        </p>
      </div>
    </div>
  );
}

export default ResetPassword;
