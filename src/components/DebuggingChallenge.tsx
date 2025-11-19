import { useState, useEffect, useRef } from 'react';
import { Bug, Play, CheckCircle, XCircle, Lightbulb, RotateCcw, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import type { TutorialExercise, TestCase } from '../types';

interface DebuggingChallengeProps {
  exercise: TutorialExercise;
  onSubmit: (code: string, isCorrect: boolean, timeSpent: number, hintsUsed: number) => void;
  onComplete?: () => void;
}

interface TestResult {
  passed: boolean;
  testCase: TestCase;
  actualOutput?: unknown;
  error?: string;
}

export const DebuggingChallenge: React.FC<DebuggingChallengeProps> = ({
  exercise,
  onSubmit,
  onComplete,
}) => {
  const [userCode, setUserCode] = useState(exercise.starter_code || '');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [hintsRevealed, setHintsRevealed] = useState<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [startTime] = useState(Date.now());
  const [timeSpent, setTimeSpent] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeSpent(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startTime]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [userCode]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const runTests = async () => {
    setIsRunning(true);
    setAttempts(prev => prev + 1);

    await new Promise(resolve => setTimeout(resolve, 500));

    const results: TestResult[] = [];

    for (const testCase of exercise.test_cases) {
      try {
        const func = new Function('input', `
          ${userCode}
          return main ? main(input) : null;
        `);

        const actualOutput = func(testCase.input);
        const passed = JSON.stringify(actualOutput) === JSON.stringify(testCase.expected_output);

        results.push({
          passed,
          testCase,
          actualOutput,
        });
      } catch (error) {
        results.push({
          passed: false,
          testCase,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    setTestResults(results);
    setIsRunning(false);

    const allPassed = results.every(r => r.passed);

    onSubmit(userCode, allPassed, timeSpent, hintsRevealed);

    if (allPassed && onComplete) {
      setTimeout(() => onComplete(), 1500);
    }
  };

  const revealNextHint = () => {
    if (hintsRevealed < exercise.hints.length) {
      setHintsRevealed(prev => prev + 1);
    }
  };

  const handleReset = () => {
    setUserCode(exercise.starter_code || '');
    setTestResults([]);
    setHintsRevealed(0);
    setAttempts(0);
  };

  const allTestsPassed = testResults.length > 0 && testResults.every(r => r.passed);
  const currentHints = exercise.hints.slice(0, hintsRevealed).sort((a, b) => a.level - b.level);

  return (
    <div className="space-y-6">
      <div className="glass-heavy rounded-xl p-6 border border-white/10">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-4 flex-1">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/20 flex-shrink-0">
              <Bug className="w-6 h-6 text-red-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-white mb-2">{exercise.title}</h2>
              <p className="text-white/70 text-sm mb-4">{exercise.instructions}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-white/60">
              <Clock className="w-4 h-4" />
              <span className="font-mono">{formatTime(timeSpent)}</span>
            </div>
            {attempts > 0 && (
              <div className="text-white/60">
                <span className="font-medium">{attempts}</span> {attempts === 1 ? 'attempt' : 'attempts'}
              </div>
            )}
          </div>
        </div>

        {exercise.max_attempts && attempts >= exercise.max_attempts && !allTestsPassed && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-2 mb-4">
            <Lightbulb className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-400">Maximum attempts reached</p>
              <p className="text-xs text-white/70 mt-1">
                Review the hints below or check the solution to understand the correct approach.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="glass-heavy rounded-xl p-4 border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Your Code</h3>
              <button
                onClick={handleReset}
                className="text-xs text-white/60 hover:text-white flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            </div>

            <textarea
              ref={textareaRef}
              value={userCode}
              onChange={(e) => setUserCode(e.target.value)}
              placeholder="Write your code here..."
              className="w-full min-h-[300px] max-h-[500px] px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-sm font-mono placeholder-white/40 focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/50 transition-all resize-none"
              spellCheck={false}
            />

            <div className="mt-3 flex items-center justify-end">
              <button
                onClick={runTests}
                disabled={!userCode.trim() || isRunning}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all flex items-center gap-2"
              >
                <Play className="w-4 h-4" />
                {isRunning ? 'Running Tests...' : 'Run Tests'}
              </button>
            </div>
          </div>

          {currentHints.length > 0 && (
            <div className="glass-heavy rounded-xl p-4 border border-white/10">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-yellow-400" />
                Hints ({currentHints.length}/{exercise.hints.length})
              </h3>
              <div className="space-y-2">
                {currentHints.map((hint, idx) => (
                  <motion.div
                    key={hint.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg"
                  >
                    <p className="text-xs text-white/70 font-medium mb-1">Hint {hint.level}:</p>
                    <p className="text-sm text-white/90">{hint.text}</p>
                  </motion.div>
                ))}
              </div>
              {hintsRevealed < exercise.hints.length && (
                <button
                  onClick={revealNextHint}
                  className="w-full mt-3 px-3 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 rounded-lg text-sm font-medium transition-all"
                >
                  Reveal Next Hint
                </button>
              )}
            </div>
          )}

          {hintsRevealed === 0 && exercise.hints.length > 0 && (
            <button
              onClick={revealNextHint}
              className="w-full glass-heavy p-4 border border-white/10 rounded-xl text-white/70 hover:text-white hover:bg-white/5 transition-all flex items-center justify-center gap-2"
            >
              <Lightbulb className="w-4 h-4" />
              <span className="text-sm font-medium">Need a hint?</span>
            </button>
          )}
        </div>

        <div className="space-y-4">
          {testResults.length > 0 && (
            <div className="glass-heavy rounded-xl p-4 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Test Results</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/60">
                    {testResults.filter(r => r.passed).length}/{testResults.length} passed
                  </span>
                  {allTestsPassed ? (
                    <CheckCircle className="w-4 h-4 text-green-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400" />
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {testResults.map((result, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className={cn(
                      'p-3 rounded-lg border',
                      result.passed
                        ? 'bg-green-500/5 border-green-500/30'
                        : 'bg-red-500/5 border-red-500/30'
                    )}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {result.passed ? (
                          <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium text-white">
                          Test {idx + 1}
                          {result.testCase.description && `: ${result.testCase.description}`}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div className="flex items-start gap-2">
                        <span className="text-white/50 font-mono w-16">Input:</span>
                        <span className="text-white/80 font-mono flex-1">
                          {JSON.stringify(result.testCase.input)}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-white/50 font-mono w-16">Expected:</span>
                        <span className="text-white/80 font-mono flex-1">
                          {JSON.stringify(result.testCase.expected_output)}
                        </span>
                      </div>
                      {!result.passed && (
                        <div className="flex items-start gap-2">
                          <span className="text-white/50 font-mono w-16">Got:</span>
                          <span className="text-red-400 font-mono flex-1">
                            {result.error || JSON.stringify(result.actualOutput)}
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              {allTestsPassed && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg"
                >
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-green-400 mb-1">
                        Challenge Complete!
                      </p>
                      <p className="text-xs text-white/70">
                        All tests passed in {attempts} {attempts === 1 ? 'attempt' : 'attempts'}.
                        Time: {formatTime(timeSpent)}
                      </p>
                      {hintsRevealed === 0 && (
                        <p className="text-xs text-green-400/80 mt-2">
                          Solved without hints! Excellent debugging skills.
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}

          {testResults.length === 0 && (
            <div className="glass-heavy rounded-xl p-8 border border-white/10 text-center">
              <Play className="w-12 h-12 text-white/30 mx-auto mb-3" />
              <p className="text-sm text-white/60">
                Run tests to see results
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
