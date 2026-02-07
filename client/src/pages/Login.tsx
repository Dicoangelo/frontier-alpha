import { useState } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';
import { SignupForm } from '@/components/auth/SignupForm';

export function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  return (
    <div className="min-h-screen bg-[#05070D] grid-bg flex items-center justify-center p-4">
      {/* Sovereign spectrum top bar */}
      <div className="sovereign-bar fixed top-0 left-0 right-0 z-50" />

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/metaventions-logo.png"
            alt="Metaventions AI"
            className="w-16 h-16 rounded-sm mx-auto mb-4"
          />
          <h1 className="text-3xl font-black text-white">
            Frontier <span className="text-gradient-brand">Alpha</span>
          </h1>
          <p className="text-[10px] text-white/40 mt-2 mono tracking-[0.4em] uppercase">
            Cognitive Factor Intelligence Platform
          </p>
        </div>

        <div className="glass-slab rounded-sm p-8">
          <h2 className="text-xl font-semibold text-white mb-6">
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>

          {mode === 'login' ? (
            <LoginForm onSwitchToSignup={() => setMode('signup')} />
          ) : (
            <SignupForm onSwitchToLogin={() => setMode('login')} />
          )}
        </div>

        <p className="text-center text-[9px] text-white/20 mt-6 mono tracking-[0.2em] uppercase">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
