/**
 * Conversation Naming Utilities
 * Generates smart, contextual titles for conversations
 */

interface ConversationContext {
  firstUserMessage?: string;
  messageCount?: number;
  hasCode?: boolean;
  hasImages?: boolean;
  topics?: string[];
}

/**
 * Generate a smart title from the first user message
 */
export function generateSmartTitle(firstMessage: string): string {
  if (!firstMessage || firstMessage.trim().length === 0) {
    return generateDefaultTitle();
  }

  // Clean and truncate the message
  const cleaned = firstMessage
    .trim()
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 150);

  // Detect conversation type and generate appropriate title
  if (isCodeRelated(cleaned)) {
    return extractCodeTitle(cleaned);
  }

  if (isQuestionAsking(cleaned)) {
    return extractQuestionTitle(cleaned);
  }

  if (isTaskOrCommand(cleaned)) {
    return extractTaskTitle(cleaned);
  }

  // Default: Use first meaningful words
  return extractGenericTitle(cleaned);
}

/**
 * Generate time-based default title
 */
export function generateDefaultTitle(): string {
  const now = new Date();
  const timeOfDay = now.getHours() < 12 ? 'Morning' : now.getHours() < 18 ? 'Afternoon' : 'Evening';
  const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${timeOfDay} Session — ${date}`;
}

/**
 * Detect if message is code-related
 */
function isCodeRelated(message: string): boolean {
  const codeKeywords = [
    'function', 'const', 'let', 'var', 'class', 'import', 'export',
    'async', 'await', 'return', 'if', 'else', 'for', 'while',
    'component', 'react', 'typescript', 'javascript', 'python',
    'debug', 'error', 'bug', 'fix', 'implement', 'refactor',
    'api', 'database', 'query', 'code', 'script'
  ];

  const lowerMessage = message.toLowerCase();
  return codeKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Detect if message is a question
 */
function isQuestionAsking(message: string): boolean {
  const questionWords = ['what', 'why', 'how', 'when', 'where', 'who', 'which', 'can', 'should', 'would', 'could', 'is', 'are', 'does'];
  const lowerMessage = message.toLowerCase();
  return questionWords.some(word => lowerMessage.startsWith(word)) || message.includes('?');
}

/**
 * Detect if message is a task or command
 */
function isTaskOrCommand(message: string): boolean {
  const taskWords = ['create', 'build', 'make', 'generate', 'add', 'remove', 'delete', 'update', 'fix', 'refactor', 'optimize', 'implement', 'design', 'write', 'help'];
  const lowerMessage = message.toLowerCase();
  return taskWords.some(word => lowerMessage.startsWith(word));
}

/**
 * Extract title from code-related message
 */
function extractCodeTitle(message: string): string {
  const patterns = [
    { regex: /(?:fix|debug|solve)\s+(.+?)(?:\s+error|\s+bug|$)/i, prefix: 'Fix' },
    { regex: /(?:implement|create|build)\s+(.+?)(?:\s+feature|\s+component|$)/i, prefix: 'Build' },
    { regex: /(?:refactor|optimize|improve)\s+(.+)/i, prefix: 'Refactor' },
    { regex: /(?:add|create)\s+(.+)/i, prefix: 'Add' },
  ];

  for (const { regex, prefix } of patterns) {
    const match = message.match(regex);
    if (match && match[1]) {
      const subject = match[1].trim().slice(0, 40);
      return `${prefix}: ${capitalizeFirst(subject)}`;
    }
  }

  // Fallback: Extract first meaningful phrase
  const words = message.split(/\s+/).slice(0, 6).join(' ');
  return capitalizeFirst(words);
}

/**
 * Extract title from question
 */
function extractQuestionTitle(message: string): string {
  // Remove question mark and clean up
  const cleaned = message.replace(/\?/g, '').trim();
  const words = cleaned.split(/\s+/).slice(0, 8).join(' ');
  return capitalizeFirst(words);
}

/**
 * Extract title from task/command
 */
function extractTaskTitle(message: string): string {
  const words = message.split(/\s+/).slice(0, 6).join(' ');
  return capitalizeFirst(words);
}

/**
 * Extract generic title from message
 */
function extractGenericTitle(message: string): string {
  const words = message.split(/\s+/).slice(0, 6).join(' ');
  return capitalizeFirst(words);
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Update conversation title based on context
 */
export async function updateConversationTitle(
  conversationId: string,
  firstUserMessage: string,
  supabase: any,
  userId: string
): Promise<void> {
  if (!firstUserMessage || firstUserMessage.trim().length === 0) return;

  const newTitle = generateSmartTitle(firstUserMessage);

  // Only update if the title is different from default patterns
  if (!newTitle.includes('Session —')) {
    await supabase
      .from('ai_conversations')
      .update({ title: newTitle })
      .eq('session_id', conversationId)
      .eq('user_id', userId);
  }
}
