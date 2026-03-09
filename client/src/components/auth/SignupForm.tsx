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

export function SignupForm({ onSwitchToLogin }: SignupFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');
  const { signup, loading, error, clearError } = useAuthStore();

  const passwordsMatch = password.length > 0 && confirmPassword.length > 0 && password === confirmPassword;
  const isFormValid = email.length > 0 && password.length >= 6 && passwordsMatch;

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
        <label htmlFor="email" className="block text-sm font-medium text-[var(--color-text-secondary)]">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="mt-1 block w-full px-4 py-3 border border-[var(--color-border)] rounded-lg shadow-sm focus:ring-2 focus:ring-[var(--color-info)] focus:border-[var(--color-info)]"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-[var(--color-text-secondary)]">
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
          className="mt-1 block w-full px-4 py-3 border border-[var(--color-border)] rounded-lg shadow-sm focus:ring-2 focus:ring-[var(--color-info)] focus:border-[var(--color-info)]"
          placeholder="••••••••"
        />
        <PasswordStrengthBar password={password} />
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">Must be at least 6 characters</p>
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-[var(--color-text-secondary)]">
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
            className={`mt-1 block w-full px-4 py-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-[var(--color-info)] focus:border-[var(--color-info)] ${
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
        <div className={`p-3 rounded-lg border ${
          displayError.includes('check your email')
            ? 'bg-[color-mix(in_srgb,var(--color-positive)_10%,transparent)] border-[color-mix(in_srgb,var(--color-positive)_20%,transparent)]'
            : 'bg-[color-mix(in_srgb,var(--color-negative)_10%,transparent)] border-[color-mix(in_srgb,var(--color-negative)_20%,transparent)]'
        }`}>
          <p className={`text-sm ${
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

      <p className="text-center text-sm text-[var(--color-text-secondary)]">
        Already have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-[var(--color-info)] hover:text-[var(--color-info)] font-medium"
        >
          Sign in
        </button>
      </p>
    </form>
  );
}
