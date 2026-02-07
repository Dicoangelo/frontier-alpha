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
        <label htmlFor="email" className="block text-[10px] mono tracking-[0.3em] uppercase text-white/40 mb-2">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="block w-full px-4 py-3 bg-white/5 border border-white/10 rounded-sm text-white placeholder-white/20 focus:outline-none focus:border-[#7B2CFF] transition-all mono text-sm"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-[10px] mono tracking-[0.3em] uppercase text-white/40 mb-2">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="block w-full px-4 py-3 bg-white/5 border border-white/10 rounded-sm text-white placeholder-white/20 focus:outline-none focus:border-[#7B2CFF] transition-all mono text-sm"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <div className="p-3 bg-[#FF6B8A]/10 border border-[#FF6B8A]/20 rounded-sm">
          <p className="text-sm text-[#FF6B8A] mono">{error}</p>
        </div>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? <Spinner className="w-5 h-5" /> : 'Sign In'}
      </Button>

      <p className="text-center text-sm text-white/40">
        Don't have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignup}
          className="text-[#18E6FF] hover:text-[#7B2CFF] font-medium transition-colors"
        >
          Sign up
        </button>
      </p>
    </form>
  );
}
