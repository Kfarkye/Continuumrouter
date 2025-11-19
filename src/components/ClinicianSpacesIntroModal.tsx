import { X, Users, MessageSquare, Brain, Sparkles, Calendar, TrendingUp, CheckCircle } from 'lucide-react';

interface ClinicianSpacesIntroModalProps {
  isOpen: boolean;
  onClose: () => void;
  clinicianCount: number;
  onGetStarted: () => void;
}

export function ClinicianSpacesIntroModal({
  isOpen,
  onClose,
  clinicianCount,
  onGetStarted,
}: ClinicianSpacesIntroModalProps) {
  if (!isOpen) return null;

  const handleGetStarted = () => {
    onGetStarted();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl my-8 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 rounded-2xl shadow-2xl border border-white/10 overflow-hidden">

        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-500 to-purple-500"></div>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 hover:bg-white/10 rounded-lg transition-colors z-10"
          aria-label="Close modal"
        >
          <X className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-400" />
        </button>

        <div className="p-6 sm:p-8 md:p-10">
          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-2xl mb-4 sm:mb-6">
              <Users className="w-8 h-8 sm:w-10 sm:h-10 text-blue-400" />
            </div>

            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3 sm:mb-4">
              Welcome to Your Clinician Spaces
            </h2>

            <p className="text-base sm:text-lg text-zinc-300 max-w-2xl mx-auto">
              You now have <strong className="text-blue-400">{clinicianCount}</strong> AI-powered assistants—one dedicated to each clinician.
              Let me show you what you can do.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 sm:p-6 hover:bg-white/10 transition-all">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500/20 to-blue-500/10 rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-2">
                    Dedicated Conversations
                  </h3>
                  <p className="text-sm sm:text-base text-zinc-400">
                    Each clinician has their own chat space. All conversations, notes, and context stay together in one place.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4 sm:p-6 hover:bg-white/10 transition-all">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-cyan-500/20 to-cyan-500/10 rounded-lg flex items-center justify-center">
                  <Brain className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-2">
                    Full Context Awareness
                  </h3>
                  <p className="text-sm sm:text-base text-zinc-400">
                    The AI knows everything: assignment history, preferences, concerns, and timeline urgency. No need to repeat yourself.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4 sm:p-6 hover:bg-white/10 transition-all">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-purple-500/20 to-purple-500/10 rounded-lg flex items-center justify-center">
                  <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-2">
                    Timeline Intelligence
                  </h3>
                  <p className="text-sm sm:text-base text-zinc-400">
                    AI proactively tracks assignment end dates and suggests when to reach out based on urgency windows.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4 sm:p-6 hover:bg-white/10 transition-all">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-green-500/20 to-green-500/10 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-green-400" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-white mb-2">
                    Personalized Outreach
                  </h3>
                  <p className="text-sm sm:text-base text-zinc-400">
                    Draft messages that reference their specific preferences, past conversations, and current situation.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 rounded-xl p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="flex items-start gap-3 sm:gap-4">
              <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-white mb-2">
                  How to Use Your Clinician Spaces
                </h3>
                <div className="space-y-2 sm:space-y-3 text-sm sm:text-base text-zinc-300">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <p><strong className="text-white">Select a clinician</strong> from the Space Selector dropdown at the top of the screen</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <p><strong className="text-white">Ask questions</strong> like "When does the assignment end?" or "Help me draft an extend message"</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <p><strong className="text-white">Add notes</strong> by saying "Note: prefers day shift only" to build their profile over time</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <p><strong className="text-white">Let AI help</strong> with timeline tracking, personalized suggestions, and strategic outreach</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4 sm:p-6 mb-6 sm:mb-8">
            <h3 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">
              Try These Example Questions:
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {[
                "When does this assignment end?",
                "What do we know about their preferences?",
                "Help me draft an extend or explore message",
                "Is this clinician high priority right now?",
                "Summarize their assignment history",
                "What should I talk to them about this week?",
              ].map((question, idx) => (
                <div
                  key={idx}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-zinc-300 transition-colors cursor-pointer"
                >
                  "{question}"
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-xl p-4 sm:p-6 mb-6 sm:mb-8">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm sm:text-base font-semibold text-white mb-1">
                  Pro Tip: Start Small
                </h4>
                <p className="text-xs sm:text-sm text-zinc-300">
                  Try opening 3-5 clinician spaces and test the AI. Once you're comfortable, scale to the rest of your roster. Each space learns and improves over time.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 sm:py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl transition-all text-sm sm:text-base font-medium"
            >
              I'll Explore Later
            </button>
            <button
              onClick={handleGetStarted}
              className="flex-1 px-6 py-3 sm:py-4 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-xl transition-all text-sm sm:text-base font-semibold shadow-lg shadow-blue-500/20"
            >
              Get Started Now →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
