export type AiModelKey = 'auto' | 'claude' | 'gemini' | 'gpt';

interface ModelConfig {
  key: AiModelKey;
  name: string;
  description: string;
  colorClass: string;
}

export const MODEL_CONFIGS: Record<AiModelKey, ModelConfig> = {
  auto: {
    key: 'auto',
    name: 'Nexus Router (AI)',
    description: 'Intelligently orchestrates the optimal AI pathway.',
    colorClass: 'text-purple-400',
  },
  claude: {
    key: 'claude',
    name: 'Claude Sonnet 4.5',
    description: 'Anthropic — Superior for complex code generation and deep analysis.',
    colorClass: 'text-orange-400',
  },
  gemini: {
    key: 'gemini',
    name: 'Gemini 2.5 Pro',
    description: 'Google DeepMind — Advanced reasoning and multi-modal capabilities.',
    colorClass: 'text-blue-400',
  },
  gpt: {
    key: 'gpt',
    name: 'GPT-5 (Preview)',
    description: 'OpenAI — Next-generation foundational model.',
    colorClass: 'text-green-400',
  },
};

export function getModelConfig(provider?: string): ModelConfig | undefined {
  if (!provider) return undefined;
  const key = provider.toLowerCase() as AiModelKey;
  return MODEL_CONFIGS[key];
}
