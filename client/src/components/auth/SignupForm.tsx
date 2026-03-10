import { useState, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/shared/Button';
import { Spinner } from '@/components/shared/Spinner';
import { Check } from 'lucide-react';

interface SignupFormProps {
  onSwitchToLogin: () => void;
}

function PasswordStrengthBar({ password }: { password: string }) {
  const strength = useMemo(() => {
    if (password.length === 0) return { level: 0, label: '', color: '' };
    if (password.length < 6) return { level: 1, label: 'Weak', color: 'var(--color-negative)' };
    if (password.length < 10) return { level: 2, label: 'Medium', color: 'var(--color-warning)' };
    return { level: 3, label: 'Strong', color: 'var(--color-positive)' };
  }, [password]);

  if (password.length === 0) return null;

  return (
    <div className="mt-2">
      <div className="flex gap-1 h-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex-1 rounded-full transition-all duration-300"
            style={{
              backgroundColor: i <= strength.level ? strength.color : 'var(--color-border)',
            }}
          />
        ))}
      </div>
      <p className="mt-1 text-xs mono" style={{ color: strength.color }}>
        {strength.label}
      </p>
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignupForm({ onSwitchToLogin }: SignupFormProps) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');
  const { signup, loading, error, clearError } = useAuthStore();

  const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  const isFormValid = email.length > 0 && !emailError && password.length >= 6 && passwordsMatch;

  const validateEmail = (value: string) => {
    if (value && !EMAIL_RE.test(value)) {
      setEmailError('Please enter a valid email address');
    } else {
      setEmailError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setValidationError('');

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setValidationError('Password must be at least 6 characters');
      return;
    }

    await signup(email, password);
  };

  const displayError = validationError || error;

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
          autoComplete="new-password"
          className="block w-full px-4 py-3 bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-all mono text-sm"
          placeholder="••••••••"
        />
        <PasswordStrengthBar password={password} />
        <p className="mt-1 text-xs text-[var(--color-text-muted)] mono">Must be at least 6 characters</p>
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-[10px] mono tracking-[0.3em] uppercase text-[var(--color-text-muted)] mb-2">
          Confirm Password
        </label>
        <div className="relative">
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            className={`block w-full px-4 py-3 bg-[var(--color-bg-tertiary)] border rounded-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-all mono text-sm ${
              confirmPassword.length > 0 && !passwordsMatch
                ? 'border-[var(--color-negative)]'
                : 'border-[var(--color-border)]'
            }`}
            placeholder="••••••••"
          />
          {passwordsMatch && (
            <Check className="absolute right-3 top-1/2 -translate-y-1/2 mt-0.5 w-5 h-5 text-[var(--color-positive)]" />
          )}
        </div>
        {confirmPassword.length > 0 && !passwordsMatch && (
          <p className="mt-1 text-xs text-[var(--color-negative)]">Passwords do not match</p>
        )}
      </div>

      {displayError && (
        <div className="p-3 rounded-sm" style={{
          backgroundColor: displayError.includes('check your email')
            ? 'color-mix(in srgb, var(--color-positive) 10%, transparent)'
            : 'color-mix(in srgb, var(--color-negative) 10%, transparent)',
          borderWidth: '1px',
          borderColor: displayError.includes('check your email')
            ? 'color-mix(in srgb, var(--color-positive) 20%, transparent)'
            : 'color-mix(in srgb, var(--color-negative) 20%, transparent)',
        }}>
          <p className={`text-sm mono ${
            displayError.includes('check your email')
              ? 'text-[var(--color-positive)]'
              : 'text-[var(--color-negative)]'
          }`}>
            {displayError}
          </p>
        </div>
      )}

      <Button type="submit" disabled={loading || !isFormValid} className="w-full">
        {loading ? <><Spinner className="w-5 h-5 inline mr-2" />Creating account...</> : 'Create Account'}
      </Button>

      <p className="text-center text-sm text-[var(--color-text-muted)]">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-[var(--color-accent-secondary)] hover:text-[var(--color-accent)] font-medium transition-colors"
        >
          Sign in
        </button>
      </p>
    </form>
  );
}
