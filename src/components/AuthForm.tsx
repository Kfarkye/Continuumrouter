import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Command } from 'lucide-react';

export const AuthForm: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        console.log('Attempting to sign up user:', email);
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          console.error('Sign up error:', error);
          throw error;
        }

        console.log('Sign up successful:', data);

        if (data?.user?.identities?.length === 0) {
          setError('This email is already registered. Please sign in instead.');
        } else {
          setError('Account created successfully! You can now sign in.');
        }
      } else {
        console.log('Attempting to sign in user:', email);
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          console.error('Sign in error:', error);
          throw error;
        }

        console.log('Sign in successful:', data);
      }
    } catch (err: any) {
      console.error('Authentication error:', err);
      const errorMessage = err.message || 'Authentication failed';

      if (errorMessage.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please try again.');
      } else if (errorMessage.includes('Email not confirmed')) {
        setError('Please check your email and confirm your account first.');
      } else if (errorMessage.includes('User already registered')) {
        setError('This email is already registered. Please sign in instead.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#000000' }}>
      <div className="w-full max-w-sm p-8 glass-heavy rounded-2xl">
        <div className="flex flex-col items-center justify-center mb-10">
          <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center mb-4">
            <Command className="w-8 h-8 text-white/70" strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-bold text-white/90 tracking-tight">Continuum</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className="w-full px-4 py-3 glass-dark text-white/90 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/10 transition-all duration-200 placeholder:text-white/30"
              required
            />
          </div>

          <div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 glass-dark text-white/90 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/10 transition-all duration-200 placeholder:text-white/30"
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className={'p-3 border rounded-lg text-sm transition-opacity duration-200 ' + (
              error.includes('successfully') || error.includes('sign in')
                ? 'bg-green-500/10 border-green-500/20 text-green-500'
                : 'bg-red-500/10 border-red-500/20 text-red-500'
            )}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 min-h-[48px] glass hover:glass-light disabled:opacity-50 text-white font-semibold rounded-lg transition-all duration-200 active:scale-98 focus-ring"
          >
            {isSignUp ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-white/[0.06] text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            className="text-small text-white/60 hover:text-white/90 transition-colors duration-200"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
};
