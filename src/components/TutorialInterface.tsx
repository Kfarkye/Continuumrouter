import { useState, useRef, useEffect } from 'react';
import { useTutorial } from '../hooks/useTutorial';
import { CodeBlock } from './CodeBlock';
import { Spinner } from './Spinner';
import ReactMarkdown from 'react-markdown';
import {
  GraduationCap,
  Send,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Code2,
  Clock,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Download,
} from 'lucide-react';
import { cn, getLanguageDisplayName } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import remarkGfm from 'remark-gfm';

interface TutorialInterfaceProps {
  userId: string;
  projectId?: string;
}

const SUPPORTED_LANGUAGES = [
  'javascript', 'typescript', 'python', 'java', 'cpp', 'csharp', 'go', 'rust',
  'ruby', 'php', 'html', 'css', 'jsx', 'tsx', 'sql', 'bash', 'json', 'yaml',
];

export const TutorialInterface: React.FC<TutorialInterfaceProps> = ({
  userId,
  projectId,
}) => {
  const [codeInput, setCodeInput] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('javascript');
  const [tutorialTitle, setTutorialTitle] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    currentTutorial,
    currentStepIndex,
    isLoading,
    isGenerating,
    error,
    tutorials,
    createTutorial,
    loadTutorial,
    deleteTutorial,
    nextStep,
    previousStep,
    goToStep,
    markStepCompleted,
    reset,
  } = useTutorial(userId);

  const currentStep = currentTutorial?.steps[currentStepIndex];

  // Auto-mark step as completed when viewed
  useEffect(() => {
    if (currentStep && !currentStep.is_completed) {
      markStepCompleted(currentStep.step_number);
    }
  }, [currentStep, markStepCompleted]);

  const handleSubmit = async () => {
    if (!codeInput.trim() || isGenerating) return;

    const title = tutorialTitle.trim() || `Tutorial: ${getLanguageDisplayName(selectedLanguage)}`;

    const tutorialId = await createTutorial({
      title,
      code: codeInput,
      language: selectedLanguage,
      project_id: projectId,
    });

    if (tutorialId) {
      await loadTutorial(tutorialId);
      setCodeInput('');
      setTutorialTitle('');
      setShowHistory(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleLoadTutorial = async (tutorialId: string) => {
    await loadTutorial(tutorialId);
    setShowHistory(false);
  };

  const handleDeleteTutorial = async (tutorialId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this tutorial?')) {
      await deleteTutorial(tutorialId);
    }
  };

  const handleDownloadTutorial = () => {
    if (!currentTutorial) return;

    let markdown = `# ${currentTutorial.title}\n\n`;
    markdown += `Language: ${getLanguageDisplayName(currentTutorial.language)}\n\n`;
    markdown += `## Code\n\n\`\`\`${currentTutorial.language}\n${currentTutorial.code}\n\`\`\`\n\n`;
    markdown += `## Tutorial Steps\n\n`;

    currentTutorial.steps.forEach(step => {
      markdown += `${step.explanation}\n\n`;
    });

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentTutorial.title.replace(/\s+/g, '-')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Welcome/Input View
  if (!currentTutorial) {
    return (
      <div className="chat-container">
        <div className="chat-header">
          <div className="header-left">
            <div className="session-info">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl glass-heavy">
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="session-title">Tutorial Mode</h1>
                  <span className="message-count">Step-by-step code explanations</span>
                </div>
              </div>
            </div>
          </div>
          <div className="header-right">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                showHistory
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'text-white/70 hover:text-white hover:bg-white/5 border border-white/10'
              )}
            >
              <Clock className="w-4 h-4" />
              History ({tutorials.length})
            </button>
          </div>
        </div>

        <div className="messages-wrapper custom-scrollbar">
          {showHistory && tutorials.length > 0 ? (
            <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
              <h2 className="text-xl font-semibold text-white mb-4">Recent Tutorials</h2>
              <div className="space-y-3">
                {tutorials.map(tutorial => (
                  <motion.div
                    key={tutorial.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-heavy rounded-xl p-4 hover:bg-white/[0.07] transition-all cursor-pointer group"
                    onClick={() => handleLoadTutorial(tutorial.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Code2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                          <h3 className="font-medium text-white truncate">{tutorial.title}</h3>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-white/50">
                          <span>{getLanguageDisplayName(tutorial.language)}</span>
                          <span>{tutorial.total_steps} steps</span>
                          <span>{tutorial.completion_percentage}% complete</span>
                        </div>
                        {tutorial.completion_percentage === 100 && (
                          <div className="flex items-center gap-1 mt-2 text-xs text-green-400">
                            <CheckCircle2 className="w-3 h-3" />
                            Completed
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => handleDeleteTutorial(tutorial.id, e)}
                        className="p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete tutorial"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
              <div className="text-center space-y-3 mb-8">
                <div className="flex items-center justify-center w-16 h-16 mx-auto rounded-2xl glass-heavy">
                  <GraduationCap className="w-8 h-8 text-blue-400" />
                </div>
                <h2 className="text-2xl font-bold text-white">Learn Code Step-by-Step</h2>
                <p className="text-white/60">
                  Paste any code snippet and get an interactive tutorial with highlighted
                  explanations
                </p>
              </div>

              {error && (
                <div className="glass-heavy border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-red-400 font-medium">Error</p>
                    <p className="text-sm text-white/70 mt-1">{error}</p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div className="glass-heavy rounded-xl p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      Tutorial Title (optional)
                    </label>
                    <input
                      type="text"
                      value={tutorialTitle}
                      onChange={(e) => setTutorialTitle(e.target.value)}
                      placeholder="e.g., Understanding React Hooks"
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/50 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      Programming Language
                    </label>
                    <select
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value)}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/50 transition-all"
                    >
                      {SUPPORTED_LANGUAGES.map(lang => (
                        <option key={lang} value={lang}>
                          {getLanguageDisplayName(lang)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      Code to Explain
                    </label>
                    <textarea
                      ref={textareaRef}
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Paste your code here..."
                      className="w-full h-64 px-4 py-3 bg-black/40 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/50 transition-all font-mono text-sm resize-none"
                    />
                    <p className="text-xs text-white/40 mt-2">
                      Press Ctrl/⌘+Enter to generate tutorial
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={!codeInput.trim() || isGenerating}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-all duration-200 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
                >
                  {isGenerating ? (
                    <>
                      <Spinner size="sm" color="white" />
                      Generating Tutorial...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Generate Tutorial
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Tutorial View
  return (
    <div className="chat-container">
      <div className="chat-header">
        <div className="header-left">
          <div className="session-info">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl glass-heavy">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="session-title">{currentTutorial.title}</h1>
                <span className="message-count">
                  Step {currentStepIndex + 1} of {currentTutorial.steps.length}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="header-right flex items-center gap-2">
          <button
            onClick={handleDownloadTutorial}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            title="Download as Markdown"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              reset();
              setShowHistory(false);
            }}
            className="flex items-center gap-2 px-4 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg text-sm font-medium transition-colors border border-white/10"
          >
            <RotateCcw className="w-4 h-4" />
            New Tutorial
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Code Panel */}
        <div className="w-full md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r border-white/10 overflow-hidden">
          <div className="flex-1 overflow-auto custom-scrollbar p-4">
            <CodeBlock
              value={currentTutorial.code}
              language={currentTutorial.language}
              highlightLines={currentStep?.highlight_spec}
              showLineNumbers={true}
              wrap={false}
              collapsible={false}
              filename={`${currentTutorial.title}.${currentTutorial.language}`}
            />
          </div>
        </div>

        {/* Explanation Panel */}
        <div className="w-full md:w-1/2 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto custom-scrollbar p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStepIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="prose prose-invert max-w-none"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {currentStep?.explanation || ''}
                </ReactMarkdown>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation Footer */}
          <div className="border-t border-white/10 p-4 glass-heavy">
            <div className="flex items-center justify-between gap-4">
              <button
                onClick={previousStep}
                disabled={currentStepIndex === 0}
                className="flex items-center gap-2 px-4 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>

              <div className="flex items-center gap-1">
                {currentTutorial.steps.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToStep(index)}
                    className={cn(
                      'w-2 h-2 rounded-full transition-all',
                      index === currentStepIndex
                        ? 'w-6 bg-blue-400'
                        : 'bg-white/20 hover:bg-white/40'
                    )}
                    title={`Go to step ${index + 1}`}
                  />
                ))}
              </div>

              <button
                onClick={nextStep}
                disabled={currentStepIndex === currentTutorial.steps.length - 1}
                className="flex items-center gap-2 px-4 py-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
