// src/config/models.tsx
import { Brain, Shuffle, Gem, Zap } from 'lucide-react';

// ENHANCEMENT: Aligned with backend provider expectations
export type AiModelKey = 'auto' | 'anthropic' | 'gemini' | 'openai';

export interface ModelConfig {
  key: AiModelKey | string;
  name: string;
  icon: JSX.Element;
  description: string;
  colorClass: string;
  providerKey: string; // The actual model identifier sent to backend
  hasVisionCapability: boolean;
  isFlashVariant?: boolean;
}

const ICON_CLASS = "w-4 h-4";

export const MODEL_CONFIGS: Record<AiModelKey, ModelConfig> = {
  auto: {
    key: 'auto',
    name: 'Auto Router',
    icon: <Shuffle className={ICON_CLASS} />,
    description: 'Intelligently selects the best model for your task',
    colorClass: 'text-purple-400',
    providerKey: 'auto',
    hasVisionCapability: true,
  },
  anthropic: {
    key: 'anthropic',
    name: 'Claude 3.5 Sonnet',
    icon: <Brain className={ICON_CLASS} />,
    description: 'Anthropic — Best for complex reasoning and code',
    colorClass: 'text-orange-400',
    providerKey: 'claude-3-5-sonnet-20240620',
    hasVisionCapability: true,
  },
  gemini: {
    key: 'gemini',
    name: 'Gemini 1.5 Flash',
    icon: <Gem className={ICON_CLASS} />,
    description: 'Google — Fast and capable multimodal AI',
    colorClass: 'text-blue-400',
    providerKey: 'gemini-1.5-flash-latest',
    hasVisionCapability: true,
  },
  openai: {
    key: 'openai',
    name: 'GPT-4o',
    icon: <Zap className={ICON_CLASS} />,
    description: 'OpenAI — Excellent balance of speed and quality',
    colorClass: 'text-green-400',
    providerKey: 'gpt-4o',
    hasVisionCapability: true,
  },
};

// Helper function to get model config by provider key or model key
export const getModelConfig = (key?: string): ModelConfig | undefined => {
    if (!key) return undefined;

    // Direct key match
    if (key in MODEL_CONFIGS) {
        return MODEL_CONFIGS[key as AiModelKey];
    }

    // Provider name normalization (for backward compatibility and message metadata)
    if (key.includes('claude') || key.includes('anthropic')) return MODEL_CONFIGS.anthropic;
    if (key.includes('gemini')) return MODEL_CONFIGS.gemini;
    if (key.includes('gpt') || key.includes('openai')) return MODEL_CONFIGS.openai;

    return undefined;
}
