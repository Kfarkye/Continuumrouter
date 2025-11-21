import React, { useState } from 'react';
import { Command, Zap, Code2, Database, FileCode, Bug, Rocket, CheckCircle2, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

const pipelineStages = [
  { icon: Command, name: 'Conversation', description: 'Your idea in your words' },
  { icon: FileCode, name: 'Translation', description: 'Technical specifications' },
  { icon: Code2, name: 'Architecture', description: 'System design' },
  { icon: Database, name: 'Database', description: 'SQL schema' },
  { icon: FileCode, name: 'Code', description: 'Paste-and-go files' },
  { icon: Bug, name: 'Debug', description: 'Systematic fixes' },
  { icon: Rocket, name: 'Deploy', description: 'Live production' },
];

const realProblems = [
  "Every Uber driver who knows exactly what drivers need",
  "Every person in the hood with hustle but no technical co-founder",
  "Every barber who's tired of trash booking software",
  "Every cook who sees problems in restaurant systems daily",
  "Every organizer who knows their community's real needs"
];

interface LandingPageProps {
  onDemoMode?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onDemoMode }) => {
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [email, setEmail] = useState('');
  const [idea, setIdea] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentProblemIndex((prev) => (prev + 1) % realProblems.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Store waitlist signup (you'll need to create this table)
      const { error } = await supabase
        .from('waitlist')
        .insert([{ email, idea, created_at: new Date().toISOString() }]);
      
      if (error) throw error;
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen overflow-x-hidden bg-black text-white">
      {/* Hero Section */}
      <div className="relative min-h-screen flex flex-col">
        {/* Header */}
        <header className="absolute top-0 left-0 right-0 z-10 p-6 md:p-8">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center">
                <Command className="w-5 h-5 text-white/70" strokeWidth={1.5} />
              </div>
              <span className="text-xl font-semibold tracking-tight">Cyborg Architect</span>
            </div>
            {onDemoMode && (
              <button
                onClick={onDemoMode}
                className="text-sm text-white/60 hover:text-white transition-colors duration-200 px-4 py-2 rounded-lg hover:bg-white/[0.05]"
              >
                Try Demo
              </button>
            )}
          </div>
        </header>

        {/* Hero Content */}
        <div className="flex-1 flex items-center justify-center px-6 py-24">
          <div className="max-w-4xl mx-auto text-center">
            <div className="mb-8 inline-block">
              <div className="px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full">
                <span className="text-sm text-blue-400 font-medium">The barrier just collapsed</span>
              </div>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight leading-tight">
              You know the problem.<br />
              <span className="text-white/60">Now you can build the solution.</span>
            </h1>

            <p className="text-xl md:text-2xl text-white/60 mb-12 max-w-3xl mx-auto leading-relaxed">
              For every domain expert who's had an idea but couldn't get past the software part.
              The Uber driver. The barber. The organizer. The person with hustle.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <button
                onClick={() => setShowWaitlist(true)}
                className="group px-8 py-4 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-full transition-all duration-200 flex items-center justify-center gap-2"
              >
                Join Pilot Program
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
                className="px-8 py-4 bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-white font-semibold rounded-full transition-all duration-200"
              >
                See How It Works
              </button>
            </div>

            {/* Rotating Problem Statements */}
            <div className="h-8 overflow-hidden">
              <div 
                className="transition-transform duration-500 ease-in-out"
                style={{ transform: `translateY(-${currentProblemIndex * 2}rem)` }}
              >
                {realProblems.map((problem, idx) => (
                  <p key={idx} className="text-white/40 italic h-8 flex items-center justify-center">
                    {problem}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The Problem Section */}
      <div className="py-24 px-6 bg-gradient-to-b from-black to-zinc-950">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold mb-8 text-center">
            The Real Problem
          </h2>
          
          <div className="space-y-6 text-lg text-white/70 leading-relaxed">
            <p>
              <span className="text-white font-semibold">Current "AI builders" don't work.</span> They generate landing pages, not real products. They break on actual features. They trap you in templates.
            </p>
            
            <p>
              <span className="text-white font-semibold">No-code platforms require technical thinking.</span> You hit walls. You're locked in. You can't customize what you need.
            </p>
            
            <p>
              <span className="text-white font-semibold">Hiring developers is expensive and slow.</span> $50k+ for something they don't understand. Six months to build the wrong thing.
            </p>
            
            <p className="text-xl text-white pt-6">
              <strong>Real people with real ideas are still locked out.</strong>
            </p>
          </div>
        </div>
      </div>

      {/* The Solution Section */}
      <div id="how-it-works" className="py-24 px-6 bg-zinc-950">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">
              The 7-Stage Pipeline
            </h2>
            <p className="text-xl text-white/60 max-w-2xl mx-auto">
              Not prompt engineering. Not magic buttons. A proven system that goes from your idea to deployed software.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {pipelineStages.map((stage, idx) => {
              const Icon = stage.icon;
              return (
                <div
                  key={idx}
                  className="p-6 bg-white/[0.02] border border-white/[0.08] rounded-2xl hover:bg-white/[0.04] transition-all duration-200"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-blue-400" strokeWidth={1.5} />
                  </div>
                  <div className="text-sm text-white/40 mb-1">Stage {idx + 1}</div>
                  <h3 className="text-lg font-semibold mb-2">{stage.name}</h3>
                  <p className="text-sm text-white/60">{stage.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* What You Get Section */}
      <div className="py-24 px-6 bg-black">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold mb-12 text-center">
            What You Actually Get
          </h2>

          <div className="space-y-6">
            {[
              { title: 'Production Infrastructure', desc: '9/11 quality router proven in production. Multi-provider AI, streaming, cost tracking, debug modes.' },
              { title: 'Your Product Deployed', desc: 'Real URL. Real users. Working software. Not a prototype. Not a template. YOUR product.' },
              { title: 'Code Literacy', desc: 'Understand your own codebase. Read it. Modify it. Debug it. Work with contractors without being blind.' },
              { title: 'Constrained Stack', desc: 'Supabase + Vercel + React. Paste-and-go methodology. No complex builds. No dependency hell.' },
              { title: 'Ongoing Guidance', desc: 'Weekly reviews. Architecture validation. Not doing it for you - teaching you to do it with AI.' },
            ].map((item, idx) => (
              <div key={idx} className="flex gap-4 p-6 bg-white/[0.02] border border-white/[0.08] rounded-xl">
                <CheckCircle2 className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                  <p className="text-white/60">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Who This Is For Section */}
      <div className="py-24 px-6 bg-zinc-950">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold mb-12 text-center">
            This Is For You If...
          </h2>

          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-green-400 mb-4">✓ You Should Apply</h3>
              {[
                'You have domain expertise in an industry',
                'You know exactly what needs to be built',
                'You can commit 10-20 hours/week for 3-6 months',
                'You want to ship a real product, not learn for fun',
                'You have high agency (you figure things out)',
              ].map((item, idx) => (
                <div key={idx} className="flex gap-3 items-start">
                  <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-white/70">{item}</span>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-red-400 mb-4">✗ This Isn't For You If...</h3>
              {[
                'You just want to "learn to code" (no specific goal)',
                'You want an easy button or magic solution',
                'You\'re looking for a get-rich-quick scheme',
                'You can\'t commit time (this requires work)',
                'You expect someone else to build it for you',
              ].map((item, idx) => (
                <div key={idx} className="flex gap-3 items-start">
                  <span className="text-red-400 flex-shrink-0">✗</span>
                  <span className="text-white/50">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-6 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <p className="text-white/80 text-center">
              <strong className="text-white">Honest promise:</strong> You'll ship YOUR product and understand YOUR code. 
              You won't become a generalist engineer. You'll become a founder who owns their tech stack.
            </p>
          </div>
        </div>
      </div>

      {/* Proof Section */}
      <div className="py-24 px-6 bg-black">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            This Actually Works
          </h2>
          
          <div className="p-8 bg-white/[0.02] border border-white/[0.08] rounded-2xl mb-8">
            <p className="text-xl text-white/80 leading-relaxed mb-6">
              I went from <strong className="text-white">zero coding experience</strong> to a <strong className="text-white">9/11 production-grade AI router</strong> in 6 months.
              Multi-provider routing. SSE streaming. Circuit breakers. W3C distributed tracing. Cost tracking. Debug modes.
            </p>
            <p className="text-lg text-white/60">
              Not theory. Not promises. <strong className="text-white">Working software serving real users.</strong>
            </p>
          </div>

          <p className="text-white/60 mb-8">
            If I can do it, so can you. The path exists. The tools work. You just need the right system.
          </p>

          <button
            onClick={() => setShowWaitlist(true)}
            className="group px-8 py-4 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-full transition-all duration-200 inline-flex items-center gap-2"
          >
            Join Pilot Program
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-24 px-6 bg-gradient-to-b from-zinc-950 to-black">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-6xl font-bold mb-6">
            Stop waiting for someone<br />to build your idea.
          </h2>
          <p className="text-xl text-white/60 mb-12">
            Build it yourself. Own your tech stack. Ship your product.
          </p>
          
          <div className="space-y-4 text-sm text-white/60">
            <p>
              <strong className="text-white">Pilot Program:</strong> 3-5 people. Heavily discounted. Over-delivered support.
            </p>
            <p>
              <strong className="text-white">Timeline:</strong> 12 weeks intensive OR 6 months part-time.
            </p>
            <p>
              <strong className="text-white">Investment:</strong> Details shared with accepted applicants.
            </p>
          </div>
        </div>
      </div>

      {/* Waitlist Modal */}
      {showWaitlist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-white/[0.1] rounded-2xl p-8 animate-fadeIn">
            {!submitted ? (
              <>
                <div className="text-center mb-8">
                  <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center mb-4 mx-auto">
                    <Command className="w-8 h-8" strokeWidth={1.5} />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Join Pilot Program</h2>
                  <p className="text-white/60">Tell us about your idea. We'll be in touch.</p>
                </div>

                <form onSubmit={handleWaitlistSubmit} className="space-y-4">
                  <div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Your email"
                      className="w-full px-4 py-3 bg-white/[0.05] border border-white/[0.1] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-white/40"
                      required
                    />
                  </div>

                  <div>
                    <textarea
                      value={idea}
                      onChange={(e) => setIdea(e.target.value)}
                      placeholder="What do you want to build? (1-2 sentences)"
                      rows={4}
                      className="w-full px-4 py-3 bg-white/[0.05] border border-white/[0.1] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-white/40 resize-none"
                      required
                    />
                  </div>

                  {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
                      {error}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowWaitlist(false)}
                      className="flex-1 py-3 bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-white rounded-lg transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-all"
                    >
                      {loading ? 'Submitting...' : 'Apply'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mb-4 mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-green-400" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Application Received</h2>
                <p className="text-white/60 mb-6">
                  We'll review your application and reach out within 48 hours.
                </p>
                <button
                  onClick={() => {
                    setShowWaitlist(false);
                    setSubmitted(false);
                    setEmail('');
                    setIdea('');
                  }}
                  className="px-6 py-2 bg-white/[0.05] hover:bg-white/[0.1] text-white rounded-lg transition-all"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/[0.04]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Command className="w-5 h-5 text-white/30" strokeWidth={1.5} />
            <span className="text-white/60">Cyborg Architect</span>
          </div>
          <div className="text-sm text-white/40 flex items-center gap-4">
            <a href="#" className="hover:text-white/70 transition-colors">Terms</a>
            <a href="#" className="hover:text-white/70 transition-colors">Privacy</a>
            <a href="#" className="hover:text-white/70 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};