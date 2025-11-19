export type ModelChoice = 'auto' | 'gpt-5' | 'claude-sonnet-4-5-20250929' | 'gemini-2.5-pro' | 'gemini-2.5-flash';
export type RoutedModel = 'gpt-5' | 'claude-sonnet-4-5-20250929' | 'gemini-2.5-pro' | 'gemini-2.5-flash';

interface RoutingContext {
  message: string;
  history: Array<{ role: string; content: string }>;
  files?: string[];
  imageIds?: string[];
  userPreference?: ModelChoice;
}

interface RoutingDecision {
  model: RoutedModel;
  reasoning: string;
  confidence: number;
}

export class AIRouter {
  private static readonly ROUTING_RULES = {
    selfAwareness: {
      gemini: /gemini|google ai|bard|palm/i,
      gpt: /gpt|openai|chatgpt/i,
      claude: /claude|anthropic/i
    },

    tasks: {
      gemini: [
        /research|search|latest|current|recent|news|real-time/i,
        /multimodal|image|video|audio/i,
        /long context|large file|document analysis/i,
        /code execution|run code|execute/i,
      ],
      gpt5: [
        /creative|story|poetry|writing/i,
        /reasoning|logic|math|problem solving/i,
        /planning|strategy|analysis/i,
        /complex|nuanced|subtle/i,
      ],
      claude: [
        /code review|refactor|optimize/i,
        /typescript|javascript|react|node/i,
        /technical writing|documentation/i,
        /best practices|clean code|architecture/i,
      ]
    }
  };

  static route(context: RoutingContext): RoutingDecision {
    if (context.userPreference && context.userPreference !== 'auto') {
      return {
        model: context.userPreference,
        reasoning: 'User explicitly selected this model',
        confidence: 1.0
      };
    }

    if (context.imageIds && context.imageIds.length > 0) {
      return {
        model: 'gemini-2.5-pro',
        reasoning: `Vision task detected with ${context.imageIds.length} image(s) - Gemini Pro excels at multimodal analysis`,
        confidence: 0.95
      };
    }

    const message = context.message.toLowerCase();

    const metaRouting = this.checkMetaQuestions(message);
    if (metaRouting) return metaRouting;

    const taskRouting = this.checkTaskPatterns(message);
    if (taskRouting.confidence > 0.7) return taskRouting;

    const contextRouting = this.checkContext(context);
    if (contextRouting.confidence > 0.6) return contextRouting;

    return {
      model: 'gemini-2.5-flash',
      reasoning: 'No specific routing criteria matched, using fast default',
      confidence: 0.5
    };
  }

  private static checkMetaQuestions(message: string): RoutingDecision | null {
    if (this.ROUTING_RULES.selfAwareness.gemini.test(message)) {
      if (message.includes('how') || message.includes('activate') || message.includes('use') || message.includes('api')) {
        return {
          model: 'gemini-2.5-flash',
          reasoning: 'Question about Gemini itself - routing to Gemini for self-knowledge',
          confidence: 0.95
        };
      }
    }

    if (this.ROUTING_RULES.selfAwareness.gpt.test(message)) {
      return {
        model: 'gpt-5',
        reasoning: 'Question about GPT/OpenAI - routing to GPT-5',
        confidence: 0.95
      };
    }

    if (this.ROUTING_RULES.selfAwareness.claude.test(message)) {
      return {
        model: 'claude-sonnet-4-5-20250929',
        reasoning: 'Question about Claude/Anthropic - routing to Claude',
        confidence: 0.95
      };
    }

    return null;
  }

  private static checkTaskPatterns(message: string): RoutingDecision {
    const scores = {
      gemini: 0,
      gpt5: 0,
      claude: 0
    };

    this.ROUTING_RULES.tasks.gemini.forEach(pattern => {
      if (pattern.test(message)) scores.gemini += 1;
    });

    this.ROUTING_RULES.tasks.gpt5.forEach(pattern => {
      if (pattern.test(message)) scores.gpt5 += 1;
    });

    this.ROUTING_RULES.tasks.claude.forEach(pattern => {
      if (pattern.test(message)) scores.claude += 1;
    });

    const maxScore = Math.max(scores.gemini, scores.gpt5, scores.claude);

    if (maxScore === 0) {
      return {
        model: 'gemini-2.5-flash',
        reasoning: 'No pattern matches',
        confidence: 0.3
      };
    }

    if (scores.gemini === maxScore) {
      return {
        model: 'gemini-2.5-pro',
        reasoning: 'Task best suited for Gemini (research/multimodal/code execution)',
        confidence: maxScore / 3
      };
    }

    if (scores.gpt5 === maxScore) {
      return {
        model: 'gpt-5',
        reasoning: 'Task best suited for GPT-5 (creative/reasoning/complex)',
        confidence: maxScore / 3
      };
    }

    return {
      model: 'claude-sonnet-4-5-20250929',
      reasoning: 'Task best suited for Claude (code/technical/documentation)',
      confidence: maxScore / 3
    };
  }

  private static checkContext(context: RoutingContext): RoutingDecision {
    if (context.files && context.files.length > 0) {
      const hasCodeFiles = context.files.some(f =>
        /\.(ts|tsx|js|jsx|py|java|cpp|c|go|rs)$/i.test(f)
      );

      if (hasCodeFiles) {
        return {
          model: 'claude-sonnet-4-5-20250929',
          reasoning: 'Code files detected - Claude excels at code review',
          confidence: 0.8
        };
      }

      const hasLargeFiles = context.files.length > 5;
      if (hasLargeFiles) {
        return {
          model: 'gemini-2.5-pro',
          reasoning: 'Multiple files detected - Gemini handles long context better',
          confidence: 0.75
        };
      }
    }

    if (context.history.length > 10) {
      return {
        model: 'gemini-2.5-pro',
        reasoning: 'Long conversation - Gemini handles extended context well',
        confidence: 0.65
      };
    }

    return {
      model: 'claude-sonnet-4-5-20250929',
      reasoning: 'General context',
      confidence: 0.4
    };
  }

  static explainRouting(decision: RoutingDecision): string {
    const modelNames: Record<string, string> = {
      'gpt-5': 'GPT-5',
      'claude-sonnet-4-5-20250929': 'Claude Sonnet 4.5',
      'gemini-2.5-pro': 'Gemini 2.5 Pro',
      'gemini-2.5-flash': 'Gemini 2.5 Flash'
    };

    return `🤖 Routed to **${modelNames[decision.model] || decision.model}**\n${decision.reasoning}\n_Confidence: ${(decision.confidence * 100).toFixed(0)}%_`;
  }
}
