/**
 * Unified RAG Retrieval Pipeline
 *
 * Implements mode-based context filtering and vector similarity search
 * for efficient document retrieval across all interaction modes.
 */

import { supabase } from './supabaseClient';
import type { EffectiveContext, InteractionMode } from './contextResolver';

export interface RetrievedDocument {
  id: string;
  content: string;
  filename: string | null;
  metadata: Record<string, any>;
  similarity: number;
  mode: InteractionMode;
  scope: string;
}

export interface RetrievalOptions {
  limit?: number;
  similarityThreshold?: number;
}

/**
 * Unified retrieval function for all modes
 *
 * @param context - The effective context
 * @param queryEmbedding - The embedding vector for the query
 * @param options - Retrieval options (limit, threshold)
 * @returns Array of retrieved documents with similarity scores
 */
export async function retrieveDocuments(
  context: EffectiveContext,
  queryEmbedding: number[],
  options: RetrievalOptions = {}
): Promise<RetrievedDocument[]> {

  const { limit = 15, similarityThreshold = 0.7 } = options;

  switch (context.effectiveMode) {
    case 'chat':
      return retrieveChatMode(context, queryEmbedding, limit, similarityThreshold);

    case 'recruiting_general':
      return retrieveRecruitingGeneralMode(context, queryEmbedding, limit, similarityThreshold);

    case 'recruiting_clinician':
      return retrieveRecruitingClinicianMode(context, queryEmbedding, limit, similarityThreshold);

    default:
      console.warn('Unknown effective mode, defaulting to chat mode');
      return retrieveChatMode(context, queryEmbedding, limit, similarityThreshold);
  }
}

/**
 * Chat mode retrieval: global chat knowledge OR space-specific knowledge
 */
async function retrieveChatMode(
  context: EffectiveContext,
  queryEmbedding: number[],
  limit: number,
  threshold: number
): Promise<RetrievedDocument[]> {

  const { data, error } = await supabase.rpc('match_documents_chat', {
    query_embedding: queryEmbedding,
    user_id_param: context.userId,
    space_id_param: context.spaceId,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    console.error('Error retrieving chat documents:', error);
    return [];
  }

  return data || [];
}

/**
 * Recruiting general mode: only global recruiting knowledge
 */
async function retrieveRecruitingGeneralMode(
  context: EffectiveContext,
  queryEmbedding: number[],
  limit: number,
  threshold: number
): Promise<RetrievedDocument[]> {

  const { data, error } = await supabase.rpc('match_documents_recruiting_general', {
    query_embedding: queryEmbedding,
    user_id_param: context.userId,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    console.error('Error retrieving recruiting general documents:', error);
    return [];
  }

  return data || [];
}

/**
 * Recruiting clinician mode: clinician-specific + general recruiting knowledge (layered)
 */
async function retrieveRecruitingClinicianMode(
  context: EffectiveContext,
  queryEmbedding: number[],
  limit: number,
  threshold: number
): Promise<RetrievedDocument[]> {

  if (!context.clinicianId) {
    console.warn('Recruiting clinician mode without clinician_id, falling back to general');
    return retrieveRecruitingGeneralMode(context, queryEmbedding, limit, threshold);
  }

  const { data, error } = await supabase.rpc('match_documents_recruiting_clinician', {
    query_embedding: queryEmbedding,
    user_id_param: context.userId,
    clinician_id_param: context.clinicianId,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    console.error('Error retrieving recruiting clinician documents:', error);
    return [];
  }

  return data || [];
}

/**
 * Search documents by text query (requires embedding generation)
 * This is a convenience wrapper that handles embedding generation
 *
 * @param context - The effective context
 * @param query - The text query
 * @param options - Retrieval options
 * @returns Array of retrieved documents
 */
export async function searchDocumentsByQuery(
  context: EffectiveContext,
  query: string,
  options: RetrievalOptions = {}
): Promise<RetrievedDocument[]> {

  // TODO: Integrate with your embedding service
  // For now, this is a placeholder that would need to call OpenAI or similar
  console.warn('searchDocumentsByQuery requires embedding generation integration');

  // Placeholder - in production, you'd call your embedding service here
  // const embedding = await generateEmbedding(query);
  // return retrieveDocuments(context, embedding, options);

  return [];
}

/**
 * Formats retrieved documents into context string for AI prompt
 *
 * @param documents - Retrieved documents
 * @returns Formatted context string
 */
export function formatDocumentsForContext(documents: RetrievedDocument[]): string {
  if (documents.length === 0) {
    return '';
  }

  const sections = documents.map((doc, index) => {
    const source = doc.filename || 'Unknown Source';
    const metadata = doc.metadata.knowledge_type
      ? ` (${doc.metadata.knowledge_type})`
      : '';

    return `[${index + 1}] ${source}${metadata}:\n${doc.content}`;
  });

  return `## Retrieved Context\n\n${sections.join('\n\n---\n\n')}`;
}

/**
 * Get document statistics for current context
 *
 * @param context - The effective context
 * @returns Statistics about available documents
 */
export async function getDocumentStats(context: EffectiveContext): Promise<{
  total: number;
  byScope: Record<string, number>;
}> {

  const { data, error } = await supabase
    .from('ai_documents')
    .select('scope', { count: 'exact', head: false })
    .eq('user_id', context.userId)
    .eq('mode', context.effectiveMode);

  if (error) {
    console.error('Error fetching document stats:', error);
    return { total: 0, byScope: {} };
  }

  const byScope = data.reduce((acc, doc) => {
    acc[doc.scope] = (acc[doc.scope] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    total: data.length,
    byScope,
  };
}
