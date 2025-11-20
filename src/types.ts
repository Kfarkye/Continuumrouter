// ============================================================================
// ID Type Aliases (prevents ID confusion bugs)
// ============================================================================

/**
 * SessionId: Used for frontend session tracking and local state management.
 * This is typically generated client-side and used for UI purposes only.
 * NOT a database foreign key.
 */
export type SessionId = string;

/**
 * ConversationId: The actual database primary key (UUID) for ai_conversations table.
 * This is the value that should be used for database relationships and FK constraints.
 * ALWAYS use this for conversation_id columns in database inserts/queries.
 */
export type ConversationId = string;

/**
 * Important: SessionId and ConversationId are conceptually different!
 * - SessionId: Client-side tracking identifier (may not exist in DB yet)
 * - ConversationId: Database primary key (must exist in ai_conversations.id)
 */

// ============================================================================
// Domain Types
// ============================================================================

export interface Project {
  id: string;
  name: string;
  description: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  clinician_id?: string;
  system_prompt?: string;
}

export interface ClinicianProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone?: string;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: string;
  clinician_id: string;
  user_id: string;
  facility_name: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'completed';
  created_at: string;
}

export interface RecruiterDashboardRow {
  clinician_id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone?: string;
  facility_name: string;
  start_date: string;
  end_date: string;
  days_remaining: number;
  trigger_type: 'extend_or_explore' | 'check_in' | 'no_action';
  priority_order: number;
}

export interface ChatSession {
  id: string;
  title: string | null;
  createdAt: string;
  updated_at?: string;
  project_id?: string;
  messages?: { length: number };
}

export interface StoredFile {
  id: string;
  name: string;
  content: string;
  mime_type: string;
  size: number;
}

export interface UploadedImage {
  id: string;
  user_id: string;
  session_id: string;
  conversation_id?: string;
  message_id?: number;
  storage_path: string;
  signed_url: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  width?: number;
  height?: number;
  thumbnail_url?: string;
  created_at: string;
  updated_at?: string;
}

export interface ImageAttachment {
  tempId: string;
  file?: File;
  url: string;
  thumbnail_url?: string;
  filename: string;
  size: number;
  mime_type: string;
  width?: number;
  height?: number;
  uploadProgress: number;
  id?: string;
  uploadError?: string;
  isUploading?: boolean;
}

export interface Citation {
  id: string;
  title: string;
  url?: string;
  excerpt: string;
  accessed_at: string;
  confidence?: number;
}

export interface SearchResult {
  id: string;
  url: string;
  title: string;
  snippet: string;
  domain: string;
  published_date?: string;
  rank: number;
  favicon_url?: string;
}

export interface SearchMetadata {
  query_id: string;
  query_detected: boolean;
  search_triggered: boolean;
  search_triggered_by: 'auto' | 'manual' | 'suggested';
  model_used?: string;
  sources_count: number;
  total_cost_usd: number;
  latency_ms: number;
  cache_hit: boolean;
  data_freshness?: string;
}

export interface SearchQuery {
  id: string;
  user_id: string;
  session_id?: string;
  conversation_id?: string;
  query_text: string;
  detected_intent?: string;
  provider_model: string;
  search_triggered_by: 'auto' | 'manual' | 'suggested';
  tokens_input: number;
  tokens_output: number;
  latency_ms?: number;
  cost_usd: number;
  cache_hit: boolean;
  error_message?: string;
  created_at: string;
}

export interface QuotaStatus {
  remaining_usd: number;
  limit_usd: number;
  current_usage_usd: number;
  search_count: number;
  reset_date: string;
  usage_percentage: number;
  alert_80_triggered: boolean;
  alert_90_triggered: boolean;
}

export interface PerplexitySearchRequest {
  query: string;
  max_results?: number;
  search_context_size?: 'low' | 'medium' | 'high';
  model?: 'sonar' | 'sonar-pro';
  published_after?: string;
  search_domain_filter?: string[];
}

export interface PerplexitySearchResponse {
  search_summary: string;
  references: Array<{
    url: string;
    title: string;
    snippet?: string;
    publish_date?: string;
  }>;
  data_freshness?: string;
  metadata?: {
    model_used: string;
    tokens_input: number;
    tokens_output: number;
    latency_ms: number;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'model' | 'system';
  content: string;
  timestamp: string | number;
  createdAt?: string;
  status?: 'sending' | 'streaming' | 'complete' | 'error';
  progress?: number;
  rating?: 'good' | 'bad' | null;
  rated_at?: string;
  metadata?: {
    provider?: string;
    model?: string;
    taskInfo?: string;
    tokensUsed?: string;
    estimatedTime?: string;
    taskType?: string;
    confidence?: number;
    processingTimeMs?: number;
    memoriesUsed?: number;
    memoriesContent?: Array<{ content: string; kind: string }>;
    citations?: Citation[];
    artifact_id?: string;
    search_metadata?: SearchMetadata;
    isStreaming?: boolean;
    isError?: boolean;
    router_info?: any;
  };
  search_results?: SearchResult[];
  files?: Array<{ name: string; size: number; type?: string; url?: string; id?: string; }>;
}

export interface StreamChunk {
  type:
    | 'text'
    | 'error'
    | 'progress'
    | 'model_switch'
    | 'action_request'
    | 'metadata'
    | 'warning'
    | 'success'
    | 'done';
  content?: string | Record<string, unknown>;
  model?: string;
  metadata?: Record<string, unknown>;
  action?: string;
  progress?: number;
  step?: string;
}

export interface FileAttachment {
  name: string;
  content: string;
}

export interface LocalFileAttachment {
  tempId: string;
  file: File;
}

export interface SavedSchema {
  id: string;
  session_id: string;
  name: string;
  content: Record<string, any> | string;
  created_at: string;
}

export interface Memory {
  id: string;
  space_id: string;
  user_id: string;
  content: string;
  kind: 'fact' | 'preference' | 'task' | 'context';
  metadata: Record<string, any>;
  similarity?: number;
  source_conversation_id?: string;
  source_message_id?: number;
  created_at: string;
  updated_at?: string;
}

export interface MemorySpace {
  id: string;
  user_id: string;
  name: string;
  description: string;
  project_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CommunicationProfile {
  id: string;
  clinician_id: string;
  user_id: string;
  communication_style: 'warm_friendly' | 'direct_brief' | 'professional_formal' | 'casual_relaxed';
  notes: string | null;
  last_contacted: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReplyThread {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ReplyMessage {
  id: string;
  thread_id: string;
  user_id: string;
  clinician_id: string | null;
  message_type: 'user_input' | 'ai_response' | 'system';
  incoming_text: string | null;
  user_goal: string | null;
  generated_reply_1: string | null;
  generated_reply_2: string | null;
  selected_reply: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface ClinicianInteraction {
  id: string;
  clinician_id: string;
  user_id: string;
  interaction_type: 'text_reply' | 'phone_call' | 'email' | 'extension_request' | 'issue_resolution' | 'other';
  interaction_summary: string | null;
  interaction_date: string;
}

export interface ClinicianFullProfile extends ClinicianProfile {
  communication_style: string | null;
  notes: string | null;
  last_contacted: string | null;
}

export interface ClinicianReplyContext {
  full_name: string;
  email: string;
  phone: string | null;
  communication_style: string;
  profile_notes: string | null;
  assignment_facility: string | null;
  assignment_end_date: string | null;
  days_remaining: number | null;
  recent_interactions: Array<{
    type: string;
    summary: string | null;
    date: string;
  }> | null;
  golden_notes: Array<{
    content: string;
    created_at: string;
  }> | null;
}

export interface AppState {
  currentSessionId: string | null;
  sidebarOpen: boolean;
  mode?: 'chat' | 'deepthink' | 'tutorial' | 'dashboard' | 'reply_assistant';
}

export enum PromptCategory {
  REFACTORING = 'Refactoring',
  ANALYSIS = 'Analysis',
  DEBUGGING = 'Debugging',
  DOCUMENTATION = 'Documentation',
  TESTING = 'Testing',
}

export interface Prompt {
  id: string;
  title: string;
  content: string;
  category: PromptCategory;
  tags: string[];
  lastModified: number;
}

export interface CodeSnippet {
  id: string;
  sessionId: string;
  messageId: string;
  content: string;
  language: string;
  orderIndex: number;
  isBookmarked: boolean;
  userDefinedName?: string;
  detectedFileName?: string;
  createdAt: string;
}

export type SkillName =
  | 'clear_communication'
  | 'debugging_ai_code'
  | 'prompt_iteration'
  | 'react_patterns'
  | 'system_integration'
  | 'code_reading'
  | 'ai_fundamentals';

export type TutorialDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type TutorialType = 'explanation' | 'exercise' | 'challenge' | 'project';

export type ExerciseType =
  | 'find_bug'
  | 'fix_code'
  | 'write_prompt'
  | 'identify_pattern'
  | 'refactor_code'
  | 'explain_code'
  | 'integrate_api';

export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type BadgeType = 'skill_mastery' | 'streak' | 'milestone' | 'community';

export interface TutorialCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  sort_order: number;
  skill_mapping: SkillName[];
  created_at: string;
}

export interface Tutorial {
  id: string;
  user_id: string;
  project_id?: string;
  category_id?: string;
  title: string;
  code: string;
  language: string;
  status: 'draft' | 'processing' | 'ready' | 'error';
  completion_percentage: number;
  total_steps: number;
  difficulty: TutorialDifficulty;
  estimated_duration_minutes: number;
  prerequisites: string[];
  skill_focus: SkillName[];
  tutorial_type: TutorialType;
  exercise_data?: ExerciseData;
  error_message?: string;
  created_at: string;
  updated_at: string;
  last_accessed_at: string;
}

export interface ExerciseData {
  mode?: 'interactive' | 'guided';
  hasCodeEditor?: boolean;
  hasPromptBuilder?: boolean;
  validationRules?: Record<string, unknown>;
}

export interface TutorialStep {
  id: string;
  tutorial_id: string;
  step_number: number;
  explanation: string;
  highlight_spec?: string;
  is_completed: boolean;
  created_at: string;
}

export interface TutorialWithSteps extends Tutorial {
  steps: TutorialStep[];
  category?: TutorialCategory;
}

export interface CreateTutorialRequest {
  title?: string;
  code: string;
  language: string;
  project_id?: string;
  category_id?: string;
  difficulty?: TutorialDifficulty;
  tutorial_type?: TutorialType;
  skill_focus?: SkillName[];
}

export interface UserSkill {
  id: string;
  user_id: string;
  skill_name: SkillName;
  proficiency_level: number;
  tutorials_completed: number;
  exercises_passed: number;
  last_practiced_at: string;
  created_at: string;
  updated_at: string;
}

export interface TutorialExercise {
  id: string;
  tutorial_id: string;
  exercise_type: ExerciseType;
  title: string;
  instructions: string;
  starter_code?: string;
  solution_code: string;
  test_cases: TestCase[];
  hints: Hint[];
  max_attempts: number;
  sort_order: number;
  created_at: string;
}

export interface TestCase {
  id: string;
  input: unknown;
  expected_output: unknown;
  description?: string;
}

export interface Hint {
  id: string;
  level: number;
  text: string;
}

export interface UserExerciseAttempt {
  id: string;
  user_id: string;
  exercise_id: string;
  attempt_number: number;
  submitted_code?: string;
  submitted_prompt?: string;
  is_correct: boolean;
  hints_used: number;
  time_spent_seconds: number;
  feedback?: string;
  created_at: string;
}

export interface PromptTemplate {
  id: string;
  user_id?: string;
  title: string;
  template_text: string;
  category: string;
  use_case: string;
  effectiveness_rating: number;
  times_used: number;
  is_public: boolean;
  example_result?: string;
  created_at: string;
  updated_at: string;
}

export interface AchievementBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: BadgeRarity;
  unlock_criteria: Record<string, unknown>;
  badge_type: BadgeType;
  created_at: string;
}

export interface UserAchievement {
  id: string;
  user_id: string;
  badge_id: string;
  earned_at: string;
  progress_snapshot: Record<string, unknown>;
  badge?: AchievementBadge;
}

export interface LearningPath {
  id: string;
  name: string;
  description: string;
  target_skill: SkillName;
  tutorial_sequence: string[];
  estimated_hours: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserLearningProgress {
  id: string;
  user_id: string;
  learning_path_id: string;
  current_tutorial_index: number;
  started_at: string;
  last_activity_at: string;
  completed_at?: string;
  learning_path?: LearningPath;
}

export type ArtifactType = 'html' | 'mermaid' | 'openapi' | 'react' | 'javascript';
export type ArtifactDisplayMode = 'preview' | 'code' | 'split';

export interface Artifact {
  id: string;
  user_id: string;
  conversation_id: string;
  message_id?: number;
  title: string;
  artifact_type: ArtifactType;
  content: string;
  compiled_content?: string;
  display_mode: ArtifactDisplayMode;
  is_fullscreen: boolean;
  version: number;
  parent_artifact_id?: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ArtifactVersion {
  id: string;
  artifact_id: string;
  version_number: number;
  content: string;
  compiled_content?: string;
  changed_by?: string;
  created_at: string;
}

export interface MessageRating {
  id: string;
  message_id: number;
  user_id: string;
  conversation_id: string;
  rating: 'good' | 'bad';
  model_used?: string;
  message_length?: number;
  response_time_ms?: number;
  feedback_text?: string;
  metadata: Record<string, any>;
  created_at: string;
}
