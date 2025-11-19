/**
 * Document Upload and Tagging System
 *
 * Handles document uploads with automatic mode and scope tagging
 * based on the current effective context.
 */

import { supabase } from './supabaseClient';
import type { EffectiveContext, DocumentScope } from './contextResolver';
import { determineDocumentScope } from './contextResolver';

export interface UploadDocumentParams {
  context: EffectiveContext;
  filename: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface UploadResult {
  success: boolean;
  documentId?: string;
  error?: string;
}

/**
 * Uploads a document with automatic tagging based on context
 *
 * @param params - Upload parameters including context, filename, and content
 * @returns Upload result with document ID or error
 */
export async function uploadDocument(params: UploadDocumentParams): Promise<UploadResult> {
  const { context, filename, content, metadata = {} } = params;

  try {
    // Determine scope based on context
    const scope = determineDocumentScope(context);

    // Build metadata with defaults
    const finalMetadata = {
      ...metadata,
      uploaded_at: new Date().toISOString(),
      original_filename: filename,
    };

    // Insert document without embedding (will be processed asynchronously)
    const { data, error } = await supabase
      .from('ai_documents')
      .insert({
        user_id: context.userId,
        space_id: context.spaceId,
        clinician_id: context.clinicianId,
        mode: context.effectiveMode,
        scope,
        filename,
        content,
        metadata: finalMetadata,
        embedding: null, // Will be generated asynchronously
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error uploading document:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    // Queue for async processing (embedding generation)
    // TODO: Integrate with background job queue
    queueDocumentProcessing(data.id);

    return {
      success: true,
      documentId: data.id,
    };

  } catch (error: any) {
    console.error('Exception during document upload:', error);
    return {
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Uploads multiple documents in batch
 *
 * @param context - The effective context
 * @param documents - Array of documents to upload
 * @returns Array of upload results
 */
export async function uploadDocumentsBatch(
  context: EffectiveContext,
  documents: Array<{ filename: string; content: string; metadata?: Record<string, any> }>
): Promise<UploadResult[]> {

  const scope = determineDocumentScope(context);

  try {
    const records = documents.map(doc => ({
      user_id: context.userId,
      space_id: context.spaceId,
      clinician_id: context.clinicianId,
      mode: context.effectiveMode,
      scope,
      filename: doc.filename,
      content: doc.content,
      metadata: {
        ...doc.metadata,
        uploaded_at: new Date().toISOString(),
        original_filename: doc.filename,
      },
      embedding: null,
    }));

    const { data, error } = await supabase
      .from('ai_documents')
      .insert(records)
      .select('id');

    if (error) {
      console.error('Error uploading documents batch:', error);
      return documents.map(() => ({
        success: false,
        error: error.message,
      }));
    }

    // Queue all for processing
    data.forEach(doc => queueDocumentProcessing(doc.id));

    return data.map(doc => ({
      success: true,
      documentId: doc.id,
    }));

  } catch (error: any) {
    console.error('Exception during batch upload:', error);
    return documents.map(() => ({
      success: false,
      error: error.message || 'Unknown error',
    }));
  }
}

/**
 * Queues a document for async processing (embedding generation)
 * This is a placeholder - in production, integrate with your job queue
 *
 * @param documentId - The document ID to process
 */
function queueDocumentProcessing(documentId: string): void {
  // TODO: Integrate with background job queue (e.g., Supabase Edge Functions, BullMQ, etc.)
  console.log(`Queued document ${documentId} for embedding generation`);

  // For now, we'll just log. In production, you would:
  // 1. Call an edge function to process the document
  // 2. Or push to a job queue (Redis, BullMQ, etc.)
  // 3. Worker picks up job, generates embedding, updates record
}

/**
 * Updates a document's embedding after async processing
 * This would typically be called by a background worker
 *
 * @param documentId - The document ID
 * @param embedding - The generated embedding vector
 * @returns Success status
 */
export async function updateDocumentEmbedding(
  documentId: string,
  embedding: number[]
): Promise<boolean> {

  const { error } = await supabase
    .from('ai_documents')
    .update({ embedding })
    .eq('id', documentId);

  if (error) {
    console.error('Error updating document embedding:', error);
    return false;
  }

  return true;
}

/**
 * Lists documents for the current context
 *
 * @param context - The effective context
 * @param options - Pagination options
 * @returns Array of documents
 */
export async function listDocuments(
  context: EffectiveContext,
  options: { limit?: number; offset?: number } = {}
): Promise<Array<{
  id: string;
  filename: string | null;
  mode: string;
  scope: string;
  metadata: Record<string, any>;
  created_at: string;
  has_embedding: boolean;
}>> {

  const { limit = 50, offset = 0 } = options;

  let query = supabase
    .from('ai_documents')
    .select('id, filename, mode, scope, metadata, created_at, embedding')
    .eq('user_id', context.userId)
    .eq('mode', context.effectiveMode)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Additional filtering based on context
  if (context.clinicianId && context.effectiveMode === 'recruiting_clinician') {
    query = query.eq('clinician_id', context.clinicianId);
  } else if (context.spaceId) {
    query = query.eq('space_id', context.spaceId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error listing documents:', error);
    return [];
  }

  return (data || []).map(doc => ({
    id: doc.id,
    filename: doc.filename,
    mode: doc.mode,
    scope: doc.scope,
    metadata: doc.metadata,
    created_at: doc.created_at,
    has_embedding: doc.embedding !== null,
  }));
}

/**
 * Deletes a document
 *
 * @param documentId - The document ID to delete
 * @param userId - The user ID for authorization
 * @returns Success status
 */
export async function deleteDocument(documentId: string, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from('ai_documents')
    .delete()
    .eq('id', documentId)
    .eq('user_id', userId); // Authorization check

  if (error) {
    console.error('Error deleting document:', error);
    return false;
  }

  return true;
}

/**
 * Gets processing status for recently uploaded documents
 *
 * @param context - The effective context
 * @returns Array of documents with processing status
 */
export async function getDocumentProcessingStatus(context: EffectiveContext): Promise<Array<{
  id: string;
  filename: string | null;
  status: 'processing' | 'ready';
  created_at: string;
}>> {

  const { data, error } = await supabase
    .from('ai_documents')
    .select('id, filename, embedding, created_at')
    .eq('user_id', context.userId)
    .eq('mode', context.effectiveMode)
    .gte('created_at', new Date(Date.now() - 3600000).toISOString()) // Last hour
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching processing status:', error);
    return [];
  }

  return (data || []).map(doc => ({
    id: doc.id,
    filename: doc.filename,
    status: doc.embedding === null ? 'processing' : 'ready',
    created_at: doc.created_at,
  }));
}
