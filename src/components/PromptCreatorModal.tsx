import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Prompt, PromptCategory, ChatMessage } from '../types';
import { X, Send, Save, Wand2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface PromptCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (prompt: Prompt) => void;
}

const CREATOR_SYSTEM_PROMPT = `You are a master prompt engineer specializing in creating exceptional, production-ready prompts for AI-assisted software development. Your expertise spans code refactoring, architecture analysis, debugging, documentation, and testing.

# CORE PRINCIPLES

## 1. Efficiency First
- Be EXTREMELY concise and action-oriented
- Ask AT MOST 1-2 clarifying questions if critical information is genuinely missing
- If sufficient context exists, IMMEDIATELY generate the prompt
- NEVER ask obvious questions
- Prioritize speed and direct value delivery

## 2. Prompt Engineering Excellence
Your prompts must follow the CLEAR framework:
- **C**ontext: Establish necessary background and domain knowledge
- **L**anguage: Use precise, unambiguous terminology
- **E**xpectations: Define exact output format and success criteria
- **A**ctions: Provide step-by-step instructions when needed
- **R**estraints: Specify boundaries, constraints, and what to avoid

## 3. Structural Quality
Every prompt you generate should include:
- **Role Definition**: "You are a [specific role with expertise]..."
- **Task Scope**: Clear boundaries of what needs to be done
- **Output Format**: JSON, markdown, code blocks, bullet points, etc.
- **Quality Criteria**: What defines a successful response
- **Examples**: When helpful for clarity (use sparingly)

# OUTPUT FORMAT

Use this exact JSON structure:
\`\`\`json
{
  "title": "Clear, concise title (4-8 words)",
  "content": "The complete prompt following CLEAR framework",
  "category": "Refactoring | Analysis | Debugging | Documentation | Testing",
  "tags": ["relevant", "searchable", "tags"]
}
\`\`\`

# PROMPT TEMPLATES BY CATEGORY

## Refactoring Prompts
Include: Modern patterns, performance optimization, code quality metrics, maintainability improvements, type safety, testing considerations, breaking change analysis

## Analysis Prompts
Include: Evaluation criteria, architectural assessment, dependency analysis, security review, scalability considerations, technical debt identification

## Debugging Prompts
Include: Error identification strategy, root cause analysis, reproduction steps, logging recommendations, fix validation, prevention measures

## Documentation Prompts
Include: Target audience, documentation structure, code examples, API reference format, usage patterns, common pitfalls

## Testing Prompts
Include: Test strategy, coverage requirements, test types (unit/integration/e2e), edge cases, mock strategies, assertion patterns

# BEST PRACTICES

**Language & Framework Specificity:**
- Always specify versions when relevant (e.g., "React 18+", "TypeScript 5.x")
- Include ecosystem-specific patterns (hooks, decorators, middleware)
- Reference official style guides and conventions

**Code Quality Focus:**
- SOLID principles application
- DRY, KISS, YAGNI principles
- Security best practices (OWASP guidelines)
- Performance optimization techniques
- Accessibility standards (WCAG 2.1)

**Professional Output:**
- Use industry-standard terminology
- Include relevant design patterns
- Reference established coding standards
- Consider production requirements
- Address CI/CD integration when applicable

# QUALITY CHECKLIST

Before outputting, verify the prompt includes:
✓ Clear role and expertise definition
✓ Specific task with measurable success criteria
✓ Explicit output format requirements
✓ Relevant constraints and boundaries
✓ Language/framework/version specifics
✓ Best practices and standards references
✓ Structured sections for readability

# EXAMPLES

**User**: "React component refactoring"
**You**: [Generate comprehensive prompt covering: Modern React 18+ patterns, custom hooks extraction, memo optimization, prop drilling solutions, TypeScript strict typing, accessibility (ARIA), performance profiling, testing strategy]

**User**: "API error handling"
**You**: [Generate prompt with: HTTP status codes, retry logic with exponential backoff, circuit breaker pattern, logging strategy, user-facing error messages, error boundaries, monitoring integration]

**User**: "database schema optimization"
**You**: [Generate prompt covering: Index strategy, normalization vs denormalization, query performance analysis, migration safety, data integrity constraints, backup considerations]

**User**: "security audit"
**You**: [Generate prompt with: OWASP Top 10 checklist, input validation, authentication/authorization review, secrets management, SQL injection prevention, XSS protection, CSRF tokens, rate limiting]

# EXECUTION MODE

SPEED IS CRITICAL. Default to immediate action over questioning. Trust user context and generate high-quality prompts immediately. Only ask for clarification if the request is genuinely ambiguous or missing critical technical specifications.`;

export const PromptCreatorModal: React.FC<PromptCreatorModalProps> = ({ isOpen, onClose, onSave }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: "What development prompt do you need? Describe it and I'll create it instantly.",
      timestamp: Date.now(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [extractedPrompt, setExtractedPrompt] = useState<Partial<Prompt> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const sessionId = useMemo(() => `creator-${crypto.randomUUID()}`, []);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Standardized Modal behavior effects (Matches Sidebar.tsx Modal)
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') onClose();
    };

    if (isOpen) {
        document.addEventListener('keydown', handleEscape);
        document.body.style.overflow = 'hidden';
        modalRef.current?.focus();
    }

    return () => {
        document.removeEventListener('keydown', handleEscape);
        if (isOpen) {
           document.body.style.overflow = 'unset';
        }
    };
  }, [isOpen, onClose]);

  const extractPromptFromMessage = (content: string): Partial<Prompt> | null => {
    const jsonMatch = content.match(/```json\s*\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);

        let category = PromptCategory.REFACTORING;
        const categoryStr = parsed.category?.toLowerCase();
        if (categoryStr?.includes('analysis')) category = PromptCategory.ANALYSIS;
        else if (categoryStr?.includes('debugging')) category = PromptCategory.DEBUGGING;
        else if (categoryStr?.includes('documentation')) category = PromptCategory.DOCUMENTATION;
        else if (categoryStr?.includes('testing')) category = PromptCategory.TESTING;

        return {
          title: parsed.title || 'Untitled Prompt',
          content: parsed.content || '',
          category,
          tags: Array.isArray(parsed.tags) ? parsed.tags : []
        };
      } catch (e) {
        console.error('Failed to parse prompt JSON:', e);
      }
    }
    return null;
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessageContent = input;
    const userMessageId = crypto.randomUUID();
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: userMessageContent,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const modelMessageId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: modelMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }]);

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        throw new Error('Authentication required');
      }

      const AI_ROUTER_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat-router`;

      const response = await fetch(AI_ROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          sessionId,
          userMessage: `${CREATOR_SYSTEM_PROMPT}\n\nUser Request: ${userMessageContent}`,
          providerHint: 'gemini',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body received');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          const dataPrefix = 'data:';
          const jsonString = trimmed.startsWith(dataPrefix) ? trimmed.slice(dataPrefix.length).trim() : trimmed;

          if (jsonString === '[DONE]' || jsonString === 'DONE') {
            setIsLoading(false);
            continue;
          }

          try {
            const chunk = JSON.parse(jsonString);

            if (chunk.type === 'text' && chunk.content) {
              accumulatedContent += chunk.content;
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === modelMessageId ? { ...msg, content: accumulatedContent } : msg
                )
              );

              const prompt = extractPromptFromMessage(accumulatedContent);
              if (prompt && prompt.title && prompt.content) {
                setExtractedPrompt(prompt);
              }
            } else if (chunk.type === 'done') {
              setIsLoading(false);
            } else if (chunk.type === 'error') {
              throw new Error(chunk.content || 'Stream error');
            }
          } catch (parseError) {
            console.warn('Failed to parse chunk:', parseError);
          }
        }
      }

      setIsLoading(false);

    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessageContent = `Error: ${error instanceof Error ? error.message : "An unknown error occurred."}`;
      setMessages(prev =>
        prev.map(msg =>
          msg.id === modelMessageId ? { ...msg, content: errorMessageContent, status: 'error' } : msg
        )
      );
      setIsLoading(false);
    }
  };

  const handleSavePrompt = () => {
    if (!extractedPrompt || !extractedPrompt.title || !extractedPrompt.content) {
      console.error('Cannot save: Missing required fields', extractedPrompt);
      return;
    }

    const newPrompt: Prompt = {
      id: crypto.randomUUID(),
      title: extractedPrompt.title,
      content: extractedPrompt.content,
      category: extractedPrompt.category || PromptCategory.REFACTORING,
      tags: extractedPrompt.tags || [],
      lastModified: Date.now()
    };

    console.log('Saving prompt:', newPrompt);
    onSave(newPrompt);
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 transition-opacity duration-300"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        ref={modalRef}
        onClick={onClose}
    >
      <div className="relative bg-[#101010] border border-white/[0.15] rounded-3xl shadow-2xl w-full max-w-3xl flex flex-col overflow-hidden transition-transform duration-300 ease-out max-h-[90vh]"
          onClick={e => e.stopPropagation()}
      >
        {/* Header (Matches standardized design) */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 sticky top-0 bg-[#101010] z-10">
          <div className="flex flex-col">
            <h2 className="text-xl font-semibold text-white">Create New Prompt</h2>
            <p className="text-sm text-white/60">Let AI help you craft the perfect development prompt</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.08] rounded-lg transition-all duration-200"
            aria-label="Close Modal"
            disabled={isLoading}
          >
            <X size={18} />
          </button>
        </div>

        {/* Generated Prompt Preview */}
        {extractedPrompt && (
          <div className="m-4 bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-blue-400" strokeWidth={2} />
                <span className="text-sm font-semibold text-white/90">Generated Prompt</span>
              </div>
              <button
                onClick={handleSavePrompt}
                className="flex items-center gap-2 bg-white text-black hover:bg-white/95 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200"
              >
                <Save className="w-4 h-4" strokeWidth={2} />
                Save
              </button>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-white/40 mb-1">Title</p>
                <p className="text-sm font-medium text-white/90">{extractedPrompt.title}</p>
              </div>
              <div>
                <p className="text-xs text-white/40 mb-1">Content</p>
                <p className="text-xs text-white/70 line-clamp-3 leading-relaxed">{extractedPrompt.content}</p>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-white/[0.05] border border-white/[0.08] text-white'
                  : (msg.status === 'error' ? 'bg-red-500/10 border border-red-500/30 text-red-300' : 'bg-white/[0.03] text-white/90')
              }`}>
                {msg.content ? (
                  <>
                    {msg.content}
                    {isLoading && msg.id === messages[messages.length - 1].id && msg.role === 'assistant' && msg.status !== 'error' && (
                      <span className="inline-block w-1 h-4 bg-white/80 ml-1 animate-pulse rounded-full"></span>
                    )}
                  </>
                ) : (
                  isLoading && msg.id === messages[messages.length - 1].id && msg.status !== 'error' && (
                    <div className="flex items-center gap-1.5 py-1">
                      <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce"></span>
                      <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-5 border-t border-white/[0.06]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-3 relative"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe the development prompt you need..."
              className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-sm focus:outline-none focus:bg-white/[0.05] focus:border-white/[0.1] transition-all duration-200 text-white placeholder:text-white/30"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-4 py-3 bg-white/[0.05] hover:bg-white/[0.08] rounded-xl text-white disabled:opacity-40 transition-all duration-200 flex items-center gap-2"
            >
              <Send className="w-4 h-4" strokeWidth={2} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
