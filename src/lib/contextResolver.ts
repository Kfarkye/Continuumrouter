/**
 * Context Resolution Middleware
 *
 * Deterministically resolves the effective context based on user selections.
 * This is the single source of truth for mode and context determination.
 */

import { supabase } from './supabaseClient';

export type InteractionMode = 'chat' | 'recruiting_general' | 'recruiting_clinician';
export type SelectedMode = 'chat' | 'recruiting';
export type ProjectType = 'vertical' | 'clinician' | 'general';
export type DocumentScope = 'global' | 'space' | 'clinician';

export interface EffectiveContext {
  userId: string;
  spaceId: string | null;
  clinicianId: string | null;
  effectiveMode: InteractionMode;
  projectType?: ProjectType;
  projectName?: string;
  clinicianName?: string;
}

export interface SpaceDetails {
  id: string;
  name: string;
  user_id: string;
  clinician_id: string | null;
  type: ProjectType | null;
  system_prompt: string | null;
}

/**
 * Resolves the effective context based on user selections
 *
 * @param userId - The authenticated user's ID
 * @param selectedMode - The user's selected mode ('chat' | 'recruiting')
 * @param selectedSpaceId - The currently selected space ID (nullable)
 * @returns EffectiveContext object with resolved mode and space details
 * @throws Error if authorization fails or space not found
 */
export async function resolveEffectiveContext(
  userId: string,
  selectedMode: SelectedMode,
  selectedSpaceId: string | null
): Promise<EffectiveContext> {

  const context: EffectiveContext = {
    userId,
    spaceId: selectedSpaceId,
    clinicianId: null,
    effectiveMode: 'chat', // Default
  };

  // 1. Authorization and Space Details
  if (selectedSpaceId) {
    const space = await getAndAuthorizeSpace(userId, selectedSpaceId);

    if (!space) {
      throw new Error('Space not found or access denied');
    }

    context.spaceId = space.id;
    context.clinicianId = space.clinician_id;
    context.projectType = space.type || undefined;
    context.projectName = space.name;

    // If this is a clinician space, get clinician name
    if (space.clinician_id) {
      const { data: clinician } = await supabase
        .from('clinician_profiles')
        .select('full_name')
        .eq('id', space.clinician_id)
        .maybeSingle();

      if (clinician) {
        context.clinicianName = clinician.full_name;
      }
    }
  }

  // 2. Derive Effective Mode
  if (selectedMode === 'chat') {
    context.effectiveMode = 'chat';
  } else if (selectedMode === 'recruiting') {
    if (context.clinicianId) {
      // Recruiting within a clinician space
      context.effectiveMode = 'recruiting_clinician';
    } else {
      // Recruiting generally or in a non-clinician space
      context.effectiveMode = 'recruiting_general';
    }
  }

  return context;
}

/**
 * Gets space details and verifies user authorization
 *
 * @param userId - The user ID to check authorization for
 * @param spaceId - The space ID to retrieve
 * @returns SpaceDetails or null if not found/unauthorized
 */
async function getAndAuthorizeSpace(
  userId: string,
  spaceId: string
): Promise<SpaceDetails | null> {

  const { data: space, error } = await supabase
    .from('projects')
    .select('id, name, user_id, clinician_id, type, system_prompt')
    .eq('id', spaceId)
    .eq('user_id', userId) // Authorization check
    .maybeSingle();

  if (error) {
    console.error('Error fetching space:', error);
    return null;
  }

  return space;
}

/**
 * Determines the document scope based on context
 *
 * @param context - The effective context
 * @returns DocumentScope for tagging documents
 */
export function determineDocumentScope(context: EffectiveContext): DocumentScope {
  if (context.clinicianId && context.effectiveMode === 'recruiting_clinician') {
    return 'clinician';
  }

  if (context.spaceId) {
    return 'space';
  }

  return 'global';
}

/**
 * Formats the context for display in UI
 *
 * @param context - The effective context
 * @returns Human-readable context description
 */
export function formatContextDisplay(context: EffectiveContext): string {
  switch (context.effectiveMode) {
    case 'chat':
      return context.projectName
        ? `Chat: ${context.projectName}`
        : 'Chat Mode';

    case 'recruiting_general':
      return 'Recruiting: General';

    case 'recruiting_clinician':
      return context.clinicianName
        ? `Recruiting: ${context.clinicianName}`
        : 'Recruiting: Clinician';

    default:
      return 'Unknown Mode';
  }
}

/**
 * Checks if a mode transition requires starting a new conversation
 *
 * @param oldMode - Previous effective mode
 * @param newMode - New effective mode
 * @returns true if new conversation should be started
 */
export function requiresNewConversation(
  oldMode: InteractionMode | null,
  newMode: InteractionMode
): boolean {
  // Always start new conversation on mode change
  return oldMode !== null && oldMode !== newMode;
}

/**
 * Gets the system prompt for the current context
 *
 * @param context - The effective context
 * @returns System prompt string or null
 */
export async function getContextSystemPrompt(
  context: EffectiveContext
): Promise<string | null> {

  // If in a space with a system prompt, use it
  if (context.spaceId) {
    const { data: space } = await supabase
      .from('projects')
      .select('system_prompt')
      .eq('id', context.spaceId)
      .maybeSingle();

    if (space?.system_prompt) {
      return space.system_prompt;
    }
  }

  // Default prompts based on mode
  switch (context.effectiveMode) {
    case 'recruiting_general':
      return 'You are a recruiting assistant helping with general recruiting strategies, templates, and processes.';

    case 'recruiting_clinician':
      return `You are a recruiting assistant helping manage the relationship with ${context.clinicianName || 'this clinician'}. Focus on their specific needs, assignment history, and personalized outreach.`;

    case 'chat':
    default:
      return null; // Use default AI behavior
  }
}
