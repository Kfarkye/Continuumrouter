import React, { useState, useCallback, forwardRef } from 'react';
import { Command, Loader2, ArrowLeft } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { TypeWriter } from './TypeWriter';

// ============================================================================
// Configuration and Copywriting
// ============================================================================

const BRAND_NAME = 'Continuum';

// Updated Marketing Copy - Focused on Context Loss for Developers
const revolutionaryExamples = [
  {
    line1: 'Your AI forgets your codebase',
    line2: 'every conversation',
    color: 'text-blue-400',
  },
  {
    line1: "You've explained the same architecture",
    line2: '47 times',
    color: 'text-purple-400',
  },
  {
    line1: "Context windows aren't the problem",
    line2: 'Management is',
    color: 'text-teal-400',
  },
  {
    line1: 'Stop re-explaining',
    line2: 'Start building',
    color: 'text-pink-400',
  },
  {
    line1: 'Your entire codebase',
    line2: 'One memory',
    color: 'text-orange-400',
  },
];

// ============================================================================
// Reusable UI Components
// ============================================================================

const Logo: React.FC<{ size?: 'sm' | 'lg' }> = ({ size = 'sm' }) => (
  <div className={`rounded-xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 backdrop-blur-md flex items-center justify-center shadow-lg border border-white/10 ${size === 'sm' ? 'w-10 h-10' : 'w-16 h-16'}`}>
    <Command className={`text-white ${size === 'sm' ? 'w-5 h-5' : 'w-8 h-8'}`} strokeWidth={2} />
  </div>
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
  loading?: boolean;
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', loading = false, children, className = '', ...props }, ref) => {
    const baseStyles = "flex items-center justify-center py-3.5 px-6 min-h-[52px] font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black shadow-sm";

    const variantStyles = variant === 'primary'
      ? 'bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white focus-visible:ring-blue-500 shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30'
      : 'bg-white/10 hover:bg-white/15 active:bg-white/20 text-white focus-visible:ring-white/50 backdrop-blur-sm border border-white/10';

    return (
      <button ref={ref} className={`${baseStyles} ${variantStyles} ${className}`} disabled={loading || props.disabled} {...props}>
        {loading ? <Loader2 className="w-5 h-5 animate-spin" aria-label="Loading" /> : children}
      </button>
    );
  }
);
Button.displayName = 'Button';

const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  (props, ref) => (
    <input
      ref={ref}
      className="w-full px-4 py-3.5 bg-white/5 border border-white/10 text-white placeholder:text-white/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/70 focus:border-blue-500/50 hover:border-white/20 transition-all duration-200 text-base"
      {...props}
    />
  )
);
Input.displayName = 'Input';

const Alert: React.FC<{ type: 'error' | 'success', message: string }> = ({ type, message }) => (
  <div
    role="alert"
    className={`p-4 border rounded-lg text-sm transition-opacity duration-200 ${
      type === 'success'
        ? 'bg-green-500/10 border-green-500/30 text-green-400'
        : 'bg-red-500/10 border-red-500/30 text-red-400'
    }`}
  >
    {message}
  </div>
);

// ============================================================================
// Showcase Panel (Left Side)
// ============================================================================

const ShowcasePanel: React.FC = () => {
  const [currentExampleIndex, setCurrentExampleIndex] = useState(0);
  const key = currentExampleIndex;

  const handleComplete = useCallback(() => {
    setCurrentExampleIndex((prev) => (prev + 1) % revolutionaryExamples.length);
  }, []);

  const currentExample = revolutionaryExamples[currentExampleIndex];

  return (
    <div className="hidden lg:flex lg:flex-1 flex-col p-12 bg-gradient-to-br from-zinc-950 via-zinc-900 to-black border-r border-white/5 relative overflow-hidden">
      {/* Subtle background gradient orbs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />

      {/* Header */}
      <header className="flex items-center gap-3 mb-auto relative z-10">
        <Logo size="sm" />
        <span className="text-xl font-bold tracking-tight text-white">{BRAND_NAME}</span>
      </header>

      {/* Feature Showcase */}
      <main className="flex items-center justify-center flex-1 relative z-10">
        <div className="max-w-lg text-5xl font-bold tracking-tight leading-tight">
          <TypeWriter
            key={key}
            lines={[
              currentExample.line1,
              currentExample.line2,
            ]}
            colors={[currentExample.color, 'text-white/90']}
            typingSpeed={45}
            deleteSpeed={30}
            pauseBeforeDelete={3000}
            pauseBeforeType={500}
            showCursor={true}
            loop={false}
            onComplete={handleComplete}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="text-sm text-white/50 relative z-10">
        Built by a developer tired of pasting the same files 50 times.
      </footer>
    </div>
  );
};

// ============================================================================
// Authentication Panel (Right Side)
// ============================================================================

interface AuthPanelProps {
    onDemoMode?: () => void;
}

type AuthView = 'landing' | 'login' | 'signup';

// Sub-component: Landing View
const LandingView: React.FC<{ onViewChange: (view: AuthView) => void, onDemoMode?: () => void }> = ({ onViewChange, onDemoMode }) => (
  <div className="w-full max-w-md text-center animate-fadeIn px-4">
    {/* Mobile Logo */}
    <div className="flex justify-center mb-10 lg:hidden">
        <Logo size="lg" />
    </div>

    {/* Updated Headline - Developer Focused */}
    <h1 className="text-5xl sm:text-6xl font-bold mb-5 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-zinc-400 leading-tight">
        Never lose context again.
    </h1>
    <p className="text-xl text-white/60 mb-12 leading-relaxed">
        The AI coding assistant that actually remembers your codebase.
    </p>

    <div className="flex flex-col sm:flex-row gap-4 mb-8">
      <Button variant="primary" onClick={() => onViewChange('signup')} className="flex-1 text-base">
        Get Started
      </Button>
      <Button variant="secondary" onClick={() => onViewChange('login')} className="flex-1 text-base">
        Log In
      </Button>
    </div>

    {onDemoMode && (
        <button
        onClick={onDemoMode}
        className="text-sm text-white/50 hover:text-white/80 hover:underline transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-lg px-3 py-2"
        >
        Try the interactive demo
        </button>
    )}
  </div>
);

// Sub-component: Auth Form (Handles Login and Signup)
const AuthForm: React.FC<{ view: 'login' | 'signup', onViewChange: (view: AuthView) => void }> = ({ view, onViewChange }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; content: string } | null>(null);

  const isSignUp = view === 'signup';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        setMessage({ type: 'success', content: 'Check your email to confirm and start building.' });
        setEmail('');
        setPassword('');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (err: any) {
      setMessage({ type: 'error', content: err.message || 'Authentication failed. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleBackClick = useCallback(() => onViewChange('landing'), [onViewChange]);

  const handleSwitchView = useCallback(() => {
      setMessage(null);
      setEmail('');
      setPassword('');
      onViewChange(isSignUp ? 'login' : 'signup');
  }, [isSignUp, onViewChange]);

  return (
    <div className="w-full max-w-sm animate-fadeIn relative">
        <button onClick={handleBackClick} className="absolute top-0 left-0 text-white/50 hover:text-white transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-xl p-2.5 hover:bg-white/5" aria-label="Go back to landing page">
            <ArrowLeft className="w-5 h-5" />
        </button>

      <div className="flex flex-col items-center justify-center mb-10 pt-10">
         <Logo size="lg" />
        <h1 className="text-3xl font-bold tracking-tight mt-6 text-white">
          {isSignUp ? 'Start Building' : 'Welcome Back'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
            <label htmlFor="email" className="block text-sm font-medium text-white/70 mb-2">Email address</label>
            <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            />
        </div>
        <div>
            <label htmlFor="password" className="block text-sm font-medium text-white/70 mb-2">Password</label>
            <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            />
        </div>

        {message && <Alert type={message.type} message={message.content} />}

        <Button type="submit" loading={loading} className="w-full text-base">
          {isSignUp ? 'Create Account' : 'Sign In'}
        </Button>
      </form>

      <div className="mt-8 pt-6 border-t border-white/[0.08] text-center">
        <p className="text-sm text-white/50">
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <button
            onClick={handleSwitchView}
            className="text-blue-400 hover:text-blue-300 font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg px-1 py-0.5 transition-colors"
          >
            {isSignUp ? 'Log in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  );
};

const AuthPanel: React.FC<AuthPanelProps> = ({ onDemoMode }) => {
    const [view, setView] = useState<AuthView>('landing');
    const currentYear = new Date().getFullYear();

    const handleViewChange = useCallback((newView: AuthView) => {
        setView(newView);
    }, []);

    return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-black relative overflow-y-auto">
        <main className="flex-1 flex items-center justify-center w-full">
            {view === 'landing' ? (
                <LandingView onViewChange={handleViewChange} onDemoMode={onDemoMode} />
            ) : (
                <AuthForm view={view} onViewChange={handleViewChange} />
            )}
        </main>

        <footer className="pt-8 pb-4 text-center w-full">
            <div className="text-xs text-white/40 flex items-center justify-center gap-4">
            <a href="/terms" className="hover:text-white/70 transition-colors duration-200">
                Terms of use
            </a>
            <span className="text-white/20">|</span>
            <a href="/privacy" className="hover:text-white/70 transition-colors duration-200">
                Privacy policy
            </a>
            </div>
            <div className="text-xs text-white/30 mt-2">
                © {currentYear} {BRAND_NAME} Corp.
            </div>
        </footer>
        </div>
    );
}

// ============================================================================
// Main Landing Page Component
// ============================================================================

interface LandingPageProps {
  onDemoMode?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onDemoMode }) => {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-black text-white antialiased">
      <ShowcasePanel />
      <AuthPanel onDemoMode={onDemoMode} />
    </div>
  );
};