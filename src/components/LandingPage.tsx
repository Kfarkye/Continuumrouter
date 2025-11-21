import React, { useState, useCallback, forwardRef } from 'react';
import { Command, Loader2, ArrowLeft } from 'lucide-react';
// Assuming these imports are correctly configured in the project
import { supabase } from '../lib/supabaseClient';
import { TypeWriter } from './TypeWriter';

// ============================================================================
// Configuration and Copywriting
// ============================================================================

const BRAND_NAME = 'Continuum';

// Marketing Copy (Retaining the raw, high-impact messaging)
const revolutionaryExamples = [
  {
    line1: 'Every Uber driver',
    line2: 'knows what drivers actually need',
    color: 'text-blue-400',
  },
  {
    line1: 'I see the problem every day',
    line2: "but I can't build it",
    color: 'text-purple-400',
  },
  {
    line1: 'Tired of trash software',
    line2: "that doesn't get my business",
    color: 'text-teal-400',
  },
  {
    line1: 'I got the idea and hustle',
    line2: 'just need to build it',
    color: 'text-pink-400',
  },
  {
    line1: 'Stop waiting for a developer',
    line2: 'build your own shit',
    color: 'text-orange-400',
  },
];

// ============================================================================
// Reusable UI Components
// ============================================================================

const Logo: React.FC<{ size?: 'sm' | 'lg' }> = ({ size = 'sm' }) => (
  // Using backdrop-blur and bg-opacity for a refined "glass" effect
  <div
    className={`rounded-xl bg-white/5 backdrop-blur-md flex items-center justify-center shadow-lg ${
      size === 'sm' ? 'w-10 h-10' : 'w-16 h-16'
    }`}
  >
    <Command
      className={`text-white/90 ${size === 'sm' ? 'w-5 h-5' : 'w-8 h-8'}`}
      strokeWidth={1.5}
    />
  </div>
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary';
  loading?: boolean;
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', loading = false, children, className = '', ...props }, ref) => {
    const baseStyles =
      'flex items-center justify-center py-3.5 px-6 min-h-[52px] font-semibold rounded-full transition-all duration-200 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black';

    const variantStyles =
      variant === 'primary'
        ? 'bg-blue-600 hover:bg-blue-700 text-white focus-visible:ring-blue-500'
        : // Secondary style uses slight backdrop blur for a premium feel
          'bg-white/10 hover:bg-white/20 text-white focus-visible:ring-white/50 backdrop-blur-sm';

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles} ${className}`}
        disabled={loading || props.disabled}
        {...props}
      >
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
      // Enhanced input styling for better contrast and focus state
      className="w-full px-4 py-3 bg-white/5 border border-white/10 text-white/90 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/70 transition-all duration-200 placeholder:text-white/40"
      {...props}
    />
  )
);
Input.displayName = 'Input';

const Alert: React.FC<{ type: 'error' | 'success'; message: string }> = ({
  type,
  message,
}) => (
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
  // Use index as key to force re-mount of TypeWriter when example changes
  const key = currentExampleIndex;

  const handleComplete = useCallback(() => {
    setCurrentExampleIndex((prev) => (prev + 1) % revolutionaryExamples.length);
  }, []);

  const currentExample = revolutionaryExamples[currentExampleIndex];

  return (
    <div className="hidden lg:flex lg:flex-1 flex-col p-10 bg-gradient-to-br from-gray-900/90 to-black border-r border-white/5">
      {/* Header */}
      <header className="flex items-center gap-3 mb-auto">
        <Logo size="sm" />
        <span className="text-xl font-semibold tracking-tight text-white">{BRAND_NAME}</span>
      </header>

      {/* Feature Showcase */}
      <main className="flex items-center justify-center flex-1">
        {/* Increased font size for impact */}
        <div className="max-w-lg text-4xl font-medium tracking-tight">
          <TypeWriter
            key={key}
            lines={[currentExample.line1, currentExample.line2]}
            // Dynamic colors for the first line
            colors={[currentExample.color, 'text-white/80']}
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

      {/* Footer inspired by Apple */}
      <footer className="text-sm text-white/40">Designed by {BRAND_NAME} in California.</footer>
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
const LandingView: React.FC<{
  onViewChange: (view: AuthView) => void;
  onDemoMode?: () => void;
}> = ({ onViewChange, onDemoMode }) => (
  <div className="w-full max-w-md text-center animate-fadeIn px-4">
    {/* Mobile Logo (Hidden on lg screens) */}
    <div className="flex justify-center mb-8 lg:hidden">
      <Logo size="lg" />
    </div>
    {/* Headline Restored to Aspirational Tone */}
    <h1 className="text-5xl font-extrabold mb-4 tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">
      The future of building software.
    </h1>
    {/* Core promise line */}
    <p className="text-xl text-white/70 mb-10">
      Ship YOUR product + understand YOUR codebase.
    </p>

    <div className="flex gap-4 mb-6">
      <Button variant="secondary" onClick={() => onViewChange('login')} className="flex-1">
        Log In
      </Button>
      <Button variant="primary" onClick={() => onViewChange('signup')} className="flex-1">
        Get Started
      </Button>
    </div>

    {onDemoMode && (
      <button
        onClick={onDemoMode}
        className="text-sm text-white/60 hover:text-white hover:underline transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded px-2 py-1"
      >
        Try the interactive demo
      </button>
    )}
  </div>
);

// Sub-component: Auth Form (Handles Login and Signup)
const AuthForm: React.FC<{ view: 'login' | 'signup'; onViewChange: (view: AuthView) => void }> = ({
  view,
  onViewChange,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: 'error' | 'success';
    content: string;
  } | null>(null);

  const isSignUp = view === 'signup';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        // A more inspiring success message
        setMessage({
          type: 'success',
          content: 'Incredible. Check your email to confirm and begin.',
        });
        // Clear form on success
        setEmail('');
        setPassword('');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        // Note: Actual redirection upon successful login is typically handled by a global auth state listener (e.g., onAuthStateChange).
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        content: err.message || 'Authentication failed. Please try again.',
      });
    } finally {
      // Ensure loading is always reset unless a successful login occurred (handled by redirect)
      setLoading(false);
    }
  };

  // Navigation handlers
  const handleBackClick = useCallback(() => onViewChange('landing'), [onViewChange]);

  const handleSwitchView = useCallback(() => {
    // Clear state when switching views
    setMessage(null);
    setEmail('');
    setPassword('');
    onViewChange(isSignUp ? 'login' : 'signup');
  }, [isSignUp, onViewChange]);

  return (
    <div className="w-full max-w-sm animate-fadeIn relative">
      {/* Dedicated Back Button for better UX */}
      <button
        onClick={handleBackClick}
        className="absolute top-0 left-0 text-white/50 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-full p-2 hover:bg-white/5"
        aria-label="Go back to landing page"
      >
        <ArrowLeft className="w-6 h-6" />
      </button>

      <div className="flex flex-col items-center justify-center mb-8 pt-8">
        <Logo size="lg" />
        <h1 className="text-3xl font-bold tracking-tight mt-6">
          {isSignUp ? 'Create Your Vision' : 'Welcome Back'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="email" className="sr-only">
            Email address
          </label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label htmlFor="password" className="sr-only">
            Password
          </label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            minLength={6}
            // Crucial for security and browser password manager compatibility
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
          />
        </div>

        {message && <Alert type={message.type} message={message.content} />}

        <Button type="submit" loading={loading} className="w-full">
          {isSignUp ? 'Create Account' : 'Sign In'}
        </Button>
      </form>

      {/* Switch between Login/Signup */}
      <div className="mt-8 pt-6 border-t border-white/[0.06] text-center">
        <p className="text-sm text-white/60">
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <button
            onClick={handleSwitchView}
            className="text-blue-400 hover:text-blue-300 hover:underline font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            {isSignUp ? 'Log in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  );
};

/**
 * The right panel managing the authentication views.
 */
const AuthPanel: React.FC<AuthPanelProps> = ({ onDemoMode }) => {
  const [view, setView] = useState<AuthView>('landing');
  // Dynamically get the current year for the footer
  const currentYear = new Date().getFullYear();

  const handleViewChange = useCallback((newView: AuthView) => {
    setView(newView);
  }, []);

  return (
    // Ensure the panel is scrollable on smaller screens if needed
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-black relative overflow-y-auto">
      <main className="flex-1 flex items-center justify-center w-full">
        {view === 'landing' ? (
          <LandingView onViewChange={handleViewChange} onDemoMode={onDemoMode} />
        ) : (
          <AuthForm view={view} onViewChange={handleViewChange} />
        )}
      </main>

      {/* Footer */}
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
};

// ============================================================================
// Main Landing Page Component
// ============================================================================

interface LandingPageProps {
  onDemoMode?: () => void;
}

/**
 * The main entry point for the Landing Page.
 */
export const LandingPage: React.FC<LandingPageProps> = ({ onDemoMode }) => {
  return (
    // Added 'antialiased' for smoother font rendering
    <div className="flex h-screen w-screen overflow-hidden bg-black text-white antialiased">
      <ShowcasePanel />
      <AuthPanel onDemoMode={onDemoMode} />
    </div>
  );
};
