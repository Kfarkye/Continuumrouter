import { useState, useRef, useEffect } from 'react';
import { Spinner } from './Spinner';
import { useDeepThink } from '../hooks/useDeepThink';
import {
  Brain,
  Search,
  CheckCircle,
  AlertCircle,
  Send,
  RotateCcw,
  ExternalLink,
  TrendingUp
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface DeepThinkInterfaceProps {
  userId: string;
}

export const DeepThinkInterface: React.FC<DeepThinkInterfaceProps> = ({ userId }) => {
  const [goal, setGoal] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const {
    isRunning,
    currentPhase,
    plan,
    evidence,
    candidates,
    result,
    error,
    usage,
    startDeepThink,
    reset
  } = useDeepThink();

  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [result]);

  const handleSubmit = async () => {
    if (!goal.trim() || isRunning) return;

    await startDeepThink(goal);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const getPhaseIcon = () => {
    if (!currentPhase) return null;

    switch (currentPhase.stage) {
      case 'planning':
        return <Brain className="w-5 h-5 animate-pulse text-blue-400" />;
      case 'evidence':
        return <Search className="w-5 h-5 animate-pulse text-green-400" />;
      case 'solving':
        return <Spinner size="md" color="blue" />;
      case 'verifying':
        return <CheckCircle className="w-5 h-5 animate-pulse text-yellow-400" />;
      case 'complete':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Spinner size="md" color="blue" />;
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div className="header-left">
          <div className="session-info">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl glass-heavy">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="session-title">DeepThink</h1>
                <span className="message-count">Multi-pass reasoning with verification</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="messages-wrapper custom-scrollbar">
        <div className="px-6 py-6 space-y-6">
          {!isRunning && !result && !error && (
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="glass rounded-2xl p-6">
                <h2 className="text-h2 text-white/90 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-400" />
                  What is DeepThink?
                </h2>
                <p className="text-body text-white/70 leading-relaxed mb-4">
                  DeepThink is an advanced reasoning system that breaks down complex problems into structured plans,
                  gathers evidence, generates multiple solution candidates, and verifies the best answer.
                </p>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div className="flex items-start gap-3">
                    <Brain className="w-5 h-5 text-blue-400 flex-shrink-0 mt-1" />
                    <div>
                      <div className="text-body font-medium text-white/90">Strategic Planning</div>
                      <div className="text-small text-white/60">Analyzes and structures your goal</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Search className="w-5 h-5 text-green-400 flex-shrink-0 mt-1" />
                    <div>
                      <div className="text-body font-medium text-white/90">Evidence Gathering</div>
                      <div className="text-small text-white/60">Finds relevant information</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Brain className="w-5 h-5 text-purple-400 flex-shrink-0 mt-1" />
                    <div>
                      <div className="text-body font-medium text-white/90">Parallel Solving</div>
                      <div className="text-small text-white/60">Generates diverse solutions</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-1" />
                    <div>
                      <div className="text-body font-medium text-white/90">Quality Verification</div>
                      <div className="text-small text-white/60">Validates accuracy and completeness</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="glass rounded-2xl p-6">
                <h2 className="text-h2 text-white/90 mb-3">Best For</h2>
                <ul className="space-y-2 text-white/70">
                  <li className="flex items-start gap-2 text-body">
                    <span className="text-blue-400 mt-1">•</span>
                    <span>Complex technical problems requiring deep analysis</span>
                  </li>
                  <li className="flex items-start gap-2 text-body">
                    <span className="text-blue-400 mt-1">•</span>
                    <span>Architectural decisions with multiple considerations</span>
                  </li>
                  <li className="flex items-start gap-2 text-body">
                    <span className="text-blue-400 mt-1">•</span>
                    <span>Research questions needing evidence and citations</span>
                  </li>
                  <li className="flex items-start gap-2 text-body">
                    <span className="text-blue-400 mt-1">•</span>
                    <span>Problems where accuracy and verification are critical</span>
                  </li>
                </ul>
              </div>
            </div>
          )}

          {currentPhase && (
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="glass rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  {getPhaseIcon()}
                  <div className="flex-1">
                    <div className="text-body font-medium text-white/90">{currentPhase.message}</div>
                    {isRunning && (
                      <div className="text-small text-white/60 mt-1">
                        This may take 30-60 seconds...
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {plan && (
                <div className="glass rounded-2xl p-5">
                  <h3 className="text-h2 text-white/90 mb-3 flex items-center gap-2">
                    <Brain className="w-5 h-5 text-blue-400" />
                    Strategic Plan
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <div className="text-body font-medium text-white/60 mb-1">Goal</div>
                      <div className="text-body text-white/90">{plan.goal_restatement}</div>
                    </div>
                    <div>
                      <div className="text-body font-medium text-white/60 mb-1">Approach</div>
                      <div className="text-body text-white/90">{plan.approach}</div>
                    </div>
                    <div>
                      <div className="text-body font-medium text-white/60 mb-1">Key Considerations</div>
                      <ul className="space-y-1">
                        {plan.key_considerations.map((consideration, idx) => (
                          <li key={idx} className="text-body text-white/90 flex items-start gap-2">
                            <span className="text-blue-400 mt-0.5">•</span>
                            <span>{consideration}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex items-center gap-4 text-body text-white/60">
                      <span>Estimated Steps: {plan.estimated_steps}</span>
                      {plan.requires_evidence && (
                        <span className="flex items-center gap-1">
                          <Search className="w-4 h-4" />
                          Evidence Required
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {evidence && evidence.count > 0 && (
                <div className="glass rounded-2xl p-5">
                  <h3 className="text-h2 text-white/90 mb-3 flex items-center gap-2">
                    <Search className="w-5 h-5 text-green-400" />
                    Evidence Gathered ({evidence.count})
                  </h3>
                  <div className="space-y-3">
                    {evidence.snippets.map((snippet, idx) => (
                      <div key={idx} className="glass-light rounded-xl p-3">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="text-body font-medium text-blue-400">[{snippet.ref_id}]</div>
                          <div className="text-small text-white/50">
                            Score: {(snippet.rerank_score * 100).toFixed(0)}%
                          </div>
                        </div>
                        <div className="text-body text-white/70 mb-2">{snippet.snippet_text}</div>
                        <a
                          href={snippet.source_uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-small text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                        >
                          {snippet.source_uri}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {candidates.length > 0 && (
                <div className="glass rounded-2xl p-5">
                  <h3 className="text-h2 text-white/90 mb-3 flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-400" />
                    Solution Candidates
                  </h3>
                  <div className="space-y-2">
                    {candidates.map((candidate, idx) => (
                      <div key={idx} className="flex items-center justify-between text-body">
                        <span className="text-white/70">Candidate {candidate.candidate + 1}</span>
                        <div className="flex items-center gap-4 text-small text-white/60">
                          <span>{candidate.steps} steps</span>
                          <span>Confidence: {(candidate.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {result && (
            <div ref={resultRef} className="max-w-3xl mx-auto space-y-4">
              <div className="glass-heavy rounded-2xl p-6 border border-green-500/30">
                <div className="flex items-center gap-3 mb-4">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                  <div>
                    <h3 className="text-h2 text-white/90">Verified Solution</h3>
                    <div className="text-body text-white/60">
                      Quality Score: {(result.verify_score * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>

                <div className="prose prose-invert max-w-none text-white/90">
                  <ReactMarkdown>{result.final}</ReactMarkdown>
                </div>

                {result.citations.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="text-body font-medium text-white/60 mb-2">Citations</div>
                    <div className="flex flex-wrap gap-2">
                      {result.citations.map((citation, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 glass-light text-blue-400 text-small rounded-lg"
                        >
                          {citation}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {result.residual_risk && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="text-body font-medium text-white/60 mb-2">Limitations</div>
                    <div className="text-body text-white/70">{result.residual_risk}</div>
                  </div>
                )}
              </div>

              {usage && (
                <div className="glass rounded-2xl p-4">
                  <div className="flex items-center justify-between text-body">
                    <span className="text-white/60">Execution Time</span>
                    <span className="text-white/90">{(usage.elapsed_ms / 1000).toFixed(1)}s</span>
                  </div>
                </div>
              )}

              <button
                onClick={reset}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 glass-heavy hover:glass rounded-xl transition-all text-white/90 font-medium"
              >
                <RotateCcw className="w-4 h-4" />
                Start New DeepThink
              </button>
            </div>
          )}

          {error && (
            <div className="max-w-3xl mx-auto">
              <div className="glass rounded-2xl p-6 border border-red-500/30">
                <div className="flex items-center gap-3 mb-3">
                  <AlertCircle className="w-6 h-6 text-red-400" />
                  <h3 className="text-h2 text-white/90">Error</h3>
                </div>
                <div className="text-body text-white/70 mb-4">{error}</div>
                <button
                  onClick={reset}
                  className="flex items-center gap-2 px-4 py-2 glass-light hover:glass rounded-xl transition-all text-white/90"
                >
                  <RotateCcw className="w-4 h-4" />
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="chat-input-container">
        <div className="flex items-end gap-3 w-full">
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your complex problem or question..."
              disabled={isRunning}
              className="chat-textarea"
              rows={3}
            />
            <div className="mt-2 text-small text-white/50">
              DeepThink uses advanced reasoning and may take 30-60 seconds
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!goal.trim() || isRunning}
            className="send-btn h-[52px]"
          >
            {isRunning ? (
              <Spinner size="md" color="white" />
            ) : (
              <>
                <Send className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
