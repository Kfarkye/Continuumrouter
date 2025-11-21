import React, { useState } from 'react';
import { Command } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { TypeWriter } from './TypeWriter';

const examples = [
  { line1: 'Every Uber driver', line2: 'knows what drivers actually need' },
  { line1: 'I see the problem every day', line2: 'but I can\'t build it' },
  { line1: 'Tired of trash software', line2: 'that doesn\'t get my business' },
  { line1: 'I got the idea and hustle', line2: 'just need to build it' },
  { line1: 'Stop waiting for a developer', line2: 'build your own shit' },
];

interface LandingPageProps {
  onDemoMode?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onDemoMode }) => {
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentExampleIndex, setCurrentExampleIndex] = useState(0);
  const [key, setKey] = useState(0);

  const handleAuthClick = (signUp: boolean) => {
    setIsSignUp(signUp);
    setShowAuthForm(true);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setError('Check your email for confirmation link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToLanding = () => {
    setShowAuthForm(false);
    setEmail('');
    setPassword('');
    setError(null);
  };

  const handleComplete = () => {
    setCurrentExampleIndex((prev) => (prev + 1) % examples.length);
    setKey(prev => prev + 1);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-black text-white">
      {/* Left Showcase Panel */}
      <div className="hidden lg:flex lg:flex-1 flex-col p-10 bg-gradient-to-br from-gray-900 to-black border-r border-white/[0.04]">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-auto">
          <div className="w-10 h-10 rounded-xl glass-light flex items-center justify-center">
            <Command className="w-5 h-5 text-white/70" strokeWidth={1.5} />
          </div>
          <span className="text-xl font-semibold tracking-tight">Continuum</span>
        </div>

        {/* Feature Showcase */}
        <div className="flex items-center justify-center flex-1">
          <div className="max-w-lg">
            <TypeWriter
              key={key}
              lines={[examples[currentExampleIndex].line1, examples[currentExampleIndex].line2]}
              colors={['text-blue-400', 'text-white/60']}
              typingSpeed={40}
              deleteSpeed={25}
              pauseBeforeDelete={2500}
              pauseBeforeType={500}
              showCursor={true}
              loop={false}
              onComplete={handleComplete}
            />
          </div>
        </div>

        {/* Spacer for balance */}
        <div className="h-10"></div>
      </div>

      {/* Right Authentication Panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-black relative">
        {!showAuthForm ? (
          // Landing View
          <div className="w-full max-w-md text-center animate-fadeIn">
            <h1 className="text-5xl font-bold mb-4 tracking-tight">Build your shit.</h1>
            <p className="text-lg text-white/60 mb-8">
              Stop waiting for someone else to build your idea.
            </p>

            <div className="flex gap-4 mb-6">
              <button
                onClick={() => handleAuthClick(false)}
                className="flex-1 py-3.5 px-6 min-h-[48px] bg-white/10 hover:bg-white/20 text-white font-semibold rounded-full transition-all duration-200"
              >
                Log in
              </button>
              <button
                onClick={() => handleAuthClick(true)}
                className="flex-1 py-3.5 px-6 min-h-[48px] bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-full transition-all duration-200"
              >
                Sign up
              </button>
            </div>

            <button
              onClick={onDemoMode}
              className="text-sm text-white/60 hover:text-white hover:underline transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded px-2 py-1"
            >
              Try it first
            </button>
          </div>
        ) : (
          // Auth Form View
          <div className="w-full max-w-sm animate-fadeIn">
            <div className="flex flex-col items-center justify-center mb-8">
              <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center mb-4">
                <Command className="w-8 h-8" strokeWidth={1.5} />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">
                {isSignUp ? 'Create Account' : 'Welcome Back'}
              </h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full px-4 py-3 bg-white/10 text-white/90 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/10 transition-all duration-200 placeholder:text-white/40"
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
                  className="w-full px-4 py-3 bg-white/10 text-white/90 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/10 transition-all duration-200 placeholder:text-white/40"
                  required
                  minLength={6}
                />
              </div>

              {error && (
                <div className={'p-3 border rounded-lg text-sm transition-opacity duration-200 ' + (
                  error.includes('Check your email')
                    ? 'bg-green-500/10 border-green-500/20 text-green-500'
                    : 'bg-red-500/10 border-red-500/20 text-red-500'
                )}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 min-h-[48px] bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-full transition-all duration-200 focus:ring focus:ring-blue-500/50"
              >
                {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-white/[0.06] text-center">
              <button
                onClick={handleBackToLanding}
                className="text-sm hover:underline"
              >
                Back to options
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="absolute bottom-8 text-center">
          <div className="flex items-center justify-center mb-3">
            <Command className="w-5 h-5 text-white/30" strokeWidth={1.5} />
          </div>
          <div className="text-xs text-white/40 flex items-center gap-2">
            <a href="#" className="hover:text-white/70 transition-colors duration-200">Terms of use</a>
            <span>|</span>
            <a href="#" className="hover:text-white/70 transition-colors duration-200">Privacy policy</a>
          </div>
        </footer>
      </div>
    </div>
  );
};