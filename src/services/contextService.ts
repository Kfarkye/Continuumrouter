import { supabase } from '../lib/supabaseClient';

export interface UserContext {
  id: string;
  user_id: string;
  context_content: string;
  is_active: boolean;
  character_count: number;
  token_estimate: number;
  created_at: string;
  updated_at: string;
}

export interface TokenValidation {
  isValid: boolean;
  totalTokens: number;
  maxTokens: number;
  contextTokens: number;
  messageTokens: number;
}

const MODEL_TOKEN_LIMITS: Record<string, number> = {
  'gpt-4': 8192,
  'gpt-4-turbo': 128000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-3.5-turbo': 16385,
  'claude-3-5-sonnet-20241022': 200000,
  'claude-3-5-haiku-20241022': 200000,
  'claude-3-opus-20240229': 200000,
  'gemini-1.5-pro-002': 1048576,
  'gemini-1.5-flash-002': 1048576,
  'gemini-2.0-flash-exp': 1048576,
};

export async function estimateTokens(text: string, model: string = 'gpt-4'): Promise<number> {
  if (!text) return 0;

  // Simple approximation: ~4 characters per token for English text
  // This is a rough estimate; actual tokenization varies by model
  const avgCharsPerToken = 4;
  return Math.ceil(text.length / avgCharsPerToken);
}

export async function validateTokenLimit(
  contextContent: string,
  message: string,
  model: string = 'gpt-4'
): Promise<TokenValidation> {
  const maxTokens = MODEL_TOKEN_LIMITS[model] || 8192;

  const contextTokens = await estimateTokens(contextContent, model);
  const messageTokens = await estimateTokens(message, model);
  const totalTokens = contextTokens + messageTokens;

  // Reserve 20% of tokens for response
  const effectiveLimit = Math.floor(maxTokens * 0.8);

  return {
    isValid: totalTokens <= effectiveLimit,
    totalTokens,
    maxTokens: effectiveLimit,
    contextTokens,
    messageTokens,
  };
}

export async function getUserContext(userId: string): Promise<UserContext | null> {
  const { data, error } = await supabase
    .from('user_contexts')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching user context:', error);
    throw error;
  }

  return data;
}

export async function saveUserContext(
  userId: string,
  contextContent: string,
  isActive: boolean
): Promise<UserContext> {
  const characterCount = contextContent.length;
  const tokenEstimate = await estimateTokens(contextContent);

  const { data, error } = await supabase
    .from('user_contexts')
    .upsert({
      user_id: userId,
      context_content: contextContent,
      is_active: isActive,
      character_count: characterCount,
      token_estimate: tokenEstimate,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving user context:', error);
    throw error;
  }

  return data;
}

export async function toggleContextActive(
  userId: string,
  isActive: boolean
): Promise<UserContext> {
  const { data, error } = await supabase
    .from('user_contexts')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error toggling context active:', error);
    throw error;
  }

  return data;
}
