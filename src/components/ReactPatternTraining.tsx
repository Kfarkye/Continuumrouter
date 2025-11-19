import { useState } from 'react';
import { Boxes, CheckCircle, XCircle, ChevronRight, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CodeBlock } from './CodeBlock';
import { cn } from '../lib/utils';

interface PatternExample {
  id: string;
  code: string;
  language: string;
  correctPattern: string;
  explanation: string;
  antiPattern?: string;
  alternatives?: string[];
}

interface ReactPatternTrainingProps {
  patterns: {
    name: string;
    description: string;
    examples: PatternExample[];
  }[];
  onComplete?: () => void;
}

export const ReactPatternTraining: React.FC<ReactPatternTrainingProps> = ({
  patterns,
  onComplete,
}) => {
  const [currentPatternIndex, setCurrentPatternIndex] = useState(0);
  const [currentExampleIndex, setCurrentExampleIndex] = useState(0);
  const [selectedPattern, setSelectedPattern] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [score, setScore] = useState(0);
  const [completed, setCompleted] = useState(false);

  const currentPattern = patterns[currentPatternIndex];
  const currentExample = currentPattern?.examples[currentExampleIndex];

  const allPatternNames = patterns.map(p => p.name);
  const totalExamples = patterns.reduce((sum, p) => sum + p.examples.length, 0);
  const currentProgress = patterns
    .slice(0, currentPatternIndex)
    .reduce((sum, p) => sum + p.examples.length, 0) + currentExampleIndex + 1;

  const handlePatternSelect = (patternName: string) => {
    setSelectedPattern(patternName);
    setShowFeedback(true);

    if (patternName === currentExample.correctPattern) {
      setScore(prev => prev + 1);
    }
  };

  const handleNext = () => {
    if (currentExampleIndex < currentPattern.examples.length - 1) {
      setCurrentExampleIndex(prev => prev + 1);
    } else if (currentPatternIndex < patterns.length - 1) {
      setCurrentPatternIndex(prev => prev + 1);
      setCurrentExampleIndex(0);
    } else {
      setCompleted(true);
      if (onComplete) onComplete();
    }

    setSelectedPattern(null);
    setShowFeedback(false);
  };

  const handleReset = () => {
    setCurrentPatternIndex(0);
    setCurrentExampleIndex(0);
    setSelectedPattern(null);
    setShowFeedback(false);
    setScore(0);
    setCompleted(false);
  };

  const isCorrect = selectedPattern === currentExample?.correctPattern;
  const scorePercentage = totalExamples > 0 ? Math.round((score / totalExamples) * 100) : 0;

  if (completed) {
    return (
      <div className="space-y-6">
        <div className="glass-heavy rounded-xl p-8 border border-white/10 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="flex items-center justify-center w-20 h-20 mx-auto mb-4 rounded-full bg-green-500/20"
          >
            <CheckCircle className="w-10 h-10 text-green-400" />
          </motion.div>

          <h2 className="text-2xl font-bold text-white mb-2">Training Complete!</h2>
          <p className="text-white/70 mb-6">
            You've completed all React pattern recognition exercises
          </p>

          <div className="inline-flex items-center gap-4 px-6 py-3 bg-white/5 rounded-xl border border-white/10 mb-6">
            <div className="text-center">
              <p className="text-3xl font-bold text-green-400">{scorePercentage}%</p>
              <p className="text-xs text-white/60 mt-1">Accuracy</p>
            </div>
            <div className="w-px h-12 bg-white/10" />
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{score}/{totalExamples}</p>
              <p className="text-xs text-white/60 mt-1">Correct</p>
            </div>
          </div>

          <button
            onClick={handleReset}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-all flex items-center gap-2 mx-auto"
          >
            <RotateCcw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!currentPattern || !currentExample) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="glass-heavy rounded-xl p-6 border border-white/10">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-4 flex-1">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-purple-500/20 flex-shrink-0">
              <Boxes className="w-6 h-6 text-purple-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-white mb-2">
                React Pattern Recognition
              </h2>
              <p className="text-white/70 text-sm">
                Identify the React pattern used in each code example
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-sm text-white/60 mb-1">Progress</p>
            <p className="text-lg font-bold text-white">
              {currentProgress}/{totalExamples}
            </p>
          </div>
        </div>

        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(currentProgress / totalExamples) * 100}%` }}
            transition={{ duration: 0.3 }}
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="glass-heavy rounded-xl p-4 border border-white/10">
            <h3 className="text-sm font-semibold text-white mb-3">Code Example</h3>
            <CodeBlock
              value={currentExample.code}
              language={currentExample.language}
              showLineNumbers={true}
              wrap={false}
              collapsible={false}
            />
          </div>

          <AnimatePresence>
            {showFeedback && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={cn(
                  'glass-heavy rounded-xl p-4 border',
                  isCorrect
                    ? 'bg-green-500/5 border-green-500/30'
                    : 'bg-red-500/5 border-red-500/30'
                )}
              >
                <div className="flex items-start gap-3 mb-3">
                  {isCorrect ? (
                    <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className={cn(
                      'text-sm font-semibold mb-1',
                      isCorrect ? 'text-green-400' : 'text-red-400'
                    )}>
                      {isCorrect ? 'Correct!' : 'Not quite right'}
                    </p>
                    {!isCorrect && (
                      <p className="text-xs text-white/70">
                        The correct pattern is: <span className="font-medium text-white">{currentExample.correctPattern}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-3 bg-white/5 rounded-lg border border-white/10">
                  <p className="text-sm text-white/90 mb-2 font-medium">Explanation:</p>
                  <p className="text-xs text-white/70 leading-relaxed">
                    {currentExample.explanation}
                  </p>
                </div>

                {currentExample.antiPattern && (
                  <div className="mt-3 p-3 bg-red-500/5 rounded-lg border border-red-500/20">
                    <p className="text-xs text-red-400 font-medium mb-1">Anti-pattern to avoid:</p>
                    <p className="text-xs text-white/70">
                      {currentExample.antiPattern}
                    </p>
                  </div>
                )}

                {currentExample.alternatives && currentExample.alternatives.length > 0 && (
                  <div className="mt-3 p-3 bg-blue-500/5 rounded-lg border border-blue-500/20">
                    <p className="text-xs text-blue-400 font-medium mb-1">Alternative approaches:</p>
                    <ul className="space-y-1">
                      {currentExample.alternatives.map((alt, idx) => (
                        <li key={idx} className="text-xs text-white/70">
                          • {alt}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  onClick={handleNext}
                  className="w-full mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2"
                >
                  {currentPatternIndex === patterns.length - 1 &&
                   currentExampleIndex === currentPattern.examples.length - 1
                    ? 'Finish'
                    : 'Next Example'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-4">
          <div className="glass-heavy rounded-xl p-4 border border-white/10">
            <h3 className="text-sm font-semibold text-white mb-3">
              Which pattern is this?
            </h3>

            <div className="space-y-2">
              {allPatternNames.map((patternName) => (
                <button
                  key={patternName}
                  onClick={() => handlePatternSelect(patternName)}
                  disabled={showFeedback}
                  className={cn(
                    'w-full p-4 rounded-lg border transition-all text-left',
                    showFeedback && patternName === currentExample.correctPattern
                      ? 'bg-green-500/20 border-green-500/50'
                      : showFeedback && patternName === selectedPattern
                      ? 'bg-red-500/20 border-red-500/50'
                      : selectedPattern === patternName
                      ? 'bg-blue-500/20 border-blue-500/50'
                      : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20',
                    showFeedback && 'cursor-default'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">
                      {patternName}
                    </span>
                    {showFeedback && patternName === currentExample.correctPattern && (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    )}
                    {showFeedback && patternName === selectedPattern && patternName !== currentExample.correctPattern && (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="glass-heavy rounded-xl p-4 border border-white/10">
            <h3 className="text-sm font-semibold text-white mb-3">Pattern Library</h3>
            <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
              {patterns.map((pattern, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'p-3 rounded-lg border transition-all',
                    currentPatternIndex === idx
                      ? 'bg-blue-500/10 border-blue-500/30'
                      : 'bg-white/5 border-white/10'
                  )}
                >
                  <h4 className="text-sm font-medium text-white mb-1">
                    {pattern.name}
                  </h4>
                  <p className="text-xs text-white/60">
                    {pattern.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-heavy rounded-xl p-4 border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-white">Score</h3>
              <span className="text-lg font-bold text-white">
                {score}/{currentProgress}
              </span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                animate={{ width: `${(score / Math.max(currentProgress, 1)) * 100}%` }}
                transition={{ duration: 0.3 }}
                className={cn(
                  'h-full rounded-full',
                  (score / Math.max(currentProgress, 1)) >= 0.8 ? 'bg-green-500' :
                  (score / Math.max(currentProgress, 1)) >= 0.6 ? 'bg-blue-500' :
                  'bg-yellow-500'
                )}
              />
            </div>
            <p className="text-xs text-white/60 mt-2 text-center">
              {Math.round((score / Math.max(currentProgress, 1)) * 100)}% accuracy
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
