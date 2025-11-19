import { useState, useRef, useEffect } from 'react';
import { MessageSquare, CheckCircle, XCircle, Lightbulb, RefreshCw, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';

interface PromptExample {
  id: string;
  label: string;
  prompt: string;
  quality: 'bad' | 'good' | 'excellent';
  issues?: string[];
  strengths?: string[];
}

interface PromptEngineeringLessonProps {
  lessonTitle: string;
  description: string;
  examples: PromptExample[];
  rubric: PromptRubricCriteria[];
  onComplete?: () => void;
}

interface PromptRubricCriteria {
  name: string;
  description: string;
  maxScore: number;
}

interface PromptScore {
  criteriaName: string;
  score: number;
  maxScore: number;
  feedback: string;
}

export const PromptEngineeringLesson: React.FC<PromptEngineeringLessonProps> = ({
  lessonTitle,
  description,
  examples,
  rubric,
  onComplete,
}) => {
  const [userPrompt, setUserPrompt] = useState('');
  const [selectedExampleId, setSelectedExampleId] = useState<string | null>(null);
  const [scores, setScores] = useState<PromptScore[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedExample = examples.find(ex => ex.id === selectedExampleId);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [userPrompt]);

  const analyzePrompt = (prompt: string): PromptScore[] => {
    const promptLower = prompt.toLowerCase();
    const wordCount = prompt.split(/\s+/).length;

    const analysisResults: PromptScore[] = rubric.map(criteria => {
      let score = 0;
      let feedback = '';

      switch (criteria.name) {
        case 'Clarity':
          if (wordCount < 5) {
            score = 1;
            feedback = 'Prompt is too vague. Add specific details about what you want.';
          } else if (wordCount < 15) {
            score = 2;
            feedback = 'Prompt has some detail but could be more specific.';
          } else if (promptLower.includes('please') || promptLower.includes('could you')) {
            score = 3;
            feedback = 'Good detail level with polite framing.';
          } else {
            score = 4;
            feedback = 'Excellent clarity with specific requirements.';
          }
          break;

        case 'Context':
          const hasContext = promptLower.includes('for') ||
                           promptLower.includes('to') ||
                           promptLower.includes('that') ||
                           promptLower.includes('because');
          if (!hasContext) {
            score = 1;
            feedback = 'Missing context about why or how this will be used.';
          } else {
            score = promptLower.split(/\b(for|to|that|because)\b/).length > 2 ? 4 : 3;
            feedback = score === 4
              ? 'Excellent context provided about usage and purpose.'
              : 'Good context, but could provide more background.';
          }
          break;

        case 'Specificity':
          const hasConstraints = promptLower.includes('must') ||
                                promptLower.includes('should') ||
                                promptLower.includes('with') ||
                                promptLower.includes('using');
          const hasExamples = promptLower.includes('like') ||
                            promptLower.includes('example') ||
                            promptLower.includes('such as');

          if (!hasConstraints && !hasExamples) {
            score = 1;
            feedback = 'Add specific requirements, constraints, or examples.';
          } else if (hasConstraints && !hasExamples) {
            score = 3;
            feedback = 'Good constraints. Consider adding examples for clarity.';
          } else {
            score = 4;
            feedback = 'Excellent specificity with both constraints and examples.';
          }
          break;

        case 'Structure':
          const hasSections = prompt.includes('\n') || prompt.includes(':');
          const hasNumbering = /\d\./.test(prompt);

          if (wordCount < 10) {
            score = 2;
            feedback = 'For longer requests, try organizing into sections.';
          } else if (!hasSections) {
            score = 2;
            feedback = 'Consider breaking complex requests into sections or bullet points.';
          } else if (hasSections && !hasNumbering) {
            score = 3;
            feedback = 'Good structure. Try numbered lists for step-by-step requests.';
          } else {
            score = 4;
            feedback = 'Excellent structure with clear organization.';
          }
          break;

        default:
          score = 3;
          feedback = 'Looks good!';
      }

      return {
        criteriaName: criteria.name,
        score,
        maxScore: criteria.maxScore,
        feedback,
      };
    });

    return analysisResults;
  };

  const handleAnalyze = () => {
    if (!userPrompt.trim()) return;

    const analysis = analyzePrompt(userPrompt);
    setScores(analysis);
    setShowFeedback(true);
    setAttempts(prev => prev + 1);

    const totalScore = analysis.reduce((sum, s) => sum + s.score, 0);
    const maxPossible = analysis.reduce((sum, s) => sum + s.maxScore, 0);
    const percentage = (totalScore / maxPossible) * 100;

    if (percentage >= 80 && onComplete) {
      setTimeout(() => onComplete(), 2000);
    }
  };

  const handleUseExample = (example: PromptExample) => {
    setUserPrompt(example.prompt);
    setSelectedExampleId(example.id);
    setShowFeedback(false);
    setScores([]);
  };

  const handleReset = () => {
    setUserPrompt('');
    setSelectedExampleId(null);
    setShowFeedback(false);
    setScores([]);
  };

  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);
  const maxPossible = scores.reduce((sum, s) => sum + s.maxScore, 0);
  const scorePercentage = maxPossible > 0 ? (totalScore / maxPossible) * 100 : 0;

  const getScoreColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-400';
    if (percentage >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getQualityBadgeColor = (quality: 'bad' | 'good' | 'excellent') => {
    switch (quality) {
      case 'excellent': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'good': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'bad': return 'bg-red-500/20 text-red-400 border-red-500/30';
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-heavy rounded-xl p-6 border border-white/10">
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500/20 flex-shrink-0">
            <MessageSquare className="w-6 h-6 text-blue-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-white mb-2">{lessonTitle}</h2>
            <p className="text-white/70 text-sm">{description}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="glass-heavy rounded-xl p-4 border border-white/10">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-yellow-400" />
              Example Prompts
            </h3>
            <div className="space-y-2">
              {examples.map(example => (
                <button
                  key={example.id}
                  onClick={() => handleUseExample(example)}
                  className={cn(
                    'w-full text-left p-3 rounded-lg transition-all border',
                    selectedExampleId === example.id
                      ? 'bg-blue-500/20 border-blue-500/30'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">{example.label}</span>
                    <span className={cn(
                      'text-xs px-2 py-1 rounded-full border font-medium',
                      getQualityBadgeColor(example.quality)
                    )}>
                      {example.quality}
                    </span>
                  </div>
                  <p className="text-xs text-white/60 line-clamp-2">{example.prompt}</p>
                </button>
              ))}
            </div>
          </div>

          {selectedExample && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-heavy rounded-xl p-4 border border-white/10"
            >
              <h3 className="text-sm font-semibold text-white mb-3">Analysis</h3>

              {selectedExample.issues && selectedExample.issues.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-red-400 font-medium mb-2">Issues:</p>
                  <ul className="space-y-1">
                    {selectedExample.issues.map((issue, idx) => (
                      <li key={idx} className="text-xs text-white/60 flex items-start gap-2">
                        <XCircle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedExample.strengths && selectedExample.strengths.length > 0 && (
                <div>
                  <p className="text-xs text-green-400 font-medium mb-2">Strengths:</p>
                  <ul className="space-y-1">
                    {selectedExample.strengths.map((strength, idx) => (
                      <li key={idx} className="text-xs text-white/60 flex items-start gap-2">
                        <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0 mt-0.5" />
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}
        </div>

        <div className="space-y-4">
          <div className="glass-heavy rounded-xl p-4 border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Your Prompt</h3>
              {attempts > 0 && (
                <button
                  onClick={handleReset}
                  className="text-xs text-white/60 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reset
                </button>
              )}
            </div>

            <textarea
              ref={textareaRef}
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="Write your prompt here or use an example above..."
              className="w-full min-h-[120px] max-h-[300px] px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-sm placeholder-white/40 focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/50 transition-all resize-none"
            />

            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-white/50">
                {userPrompt.split(/\s+/).filter(Boolean).length} words
              </span>
              <button
                onClick={handleAnalyze}
                disabled={!userPrompt.trim()}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all"
              >
                Analyze Prompt
              </button>
            </div>
          </div>

          <AnimatePresence>
            {showFeedback && scores.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="glass-heavy rounded-xl p-4 border border-white/10"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-400" />
                    Prompt Quality Score
                  </h3>
                  <span className={cn(
                    'text-xl font-bold',
                    getScoreColor(scorePercentage)
                  )}>
                    {Math.round(scorePercentage)}%
                  </span>
                </div>

                <div className="space-y-3">
                  {scores.map((score, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-white/80">
                          {score.criteriaName}
                        </span>
                        <span className="text-xs text-white/60">
                          {score.score}/{score.maxScore}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(score.score / score.maxScore) * 100}%` }}
                          transition={{ duration: 0.5, delay: idx * 0.1 }}
                          className={cn(
                            'h-full rounded-full',
                            score.score === score.maxScore ? 'bg-green-500' :
                            score.score >= score.maxScore * 0.7 ? 'bg-blue-500' :
                            'bg-yellow-500'
                          )}
                        />
                      </div>
                      <p className="text-xs text-white/50">{score.feedback}</p>
                    </div>
                  ))}
                </div>

                {scorePercentage >= 80 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-start gap-2"
                  >
                    <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-400">Excellent Work!</p>
                      <p className="text-xs text-white/70 mt-1">
                        Your prompt demonstrates strong engineering skills. Keep practicing!
                      </p>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
