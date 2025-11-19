// src/utils/codeExtractor.ts

export interface ExtractedCodeBlock {
  content: string;
  language: string;
  startLine: number;
  endLine: number;
  orderIndex: number;
  lineCount: number;
}

/**
 * Extracts only important code blocks from markdown content
 * Filters out trivial examples and only keeps full files and substantial snippets
 */
export function extractCodeBlocks(markdown: string): ExtractedCodeBlock[] {
  const codeBlocks: ExtractedCodeBlock[] = [];
  let orderIndex = 0;

  // Pattern to match fenced code blocks with optional language identifier
  // Matches: ```language\ncode\n``` or ```\ncode\n```
  const fencedPattern = /```(\w+)?\n([\s\S]*?)```/g;

  let match: RegExpExecArray | null;

  while ((match = fencedPattern.exec(markdown)) !== null) {
    const language = match[1] || 'plaintext';
    const content = match[2].trim();

    if (content && isImportantSnippet(content, language)) {
      const lines = content.split('\n');
      const lineCount = lines.length;

      // Calculate approximate line position in the original markdown
      const beforeContent = markdown.substring(0, match.index);
      const startLine = beforeContent.split('\n').length;

      codeBlocks.push({
        content,
        language: normalizeLanguage(language),
        startLine,
        endLine: startLine + lineCount,
        orderIndex: orderIndex++,
        lineCount,
      });
    }
  }

  return codeBlocks;
}

/**
 * Determines if a code snippet is important enough to extract
 * Only extracts full files and substantial, meaningful code blocks
 */
function isImportantSnippet(content: string, language: string): boolean {
  const lines = content.split('\n');
  const lineCount = lines.length;
  const normalizedLang = normalizeLanguage(language);

  // Minimum line count threshold - skip tiny snippets
  const MIN_LINES = 5;

  // Skip if too short (unless it's a config file)
  if (lineCount < MIN_LINES) {
    // Exception: Allow short but important config files
    if (isConfigFile(content, normalizedLang)) {
      return true;
    }
    return false;
  }

  // Skip trivial examples and demo code
  if (isTrivialExample(content, normalizedLang)) {
    return false;
  }

  // Check if it's a complete file (has file structure indicators)
  if (isCompleteFile(content, normalizedLang)) {
    return true;
  }

  // Check if it's a substantial component/module
  if (isSubstantialCode(content, normalizedLang)) {
    return true;
  }

  // Default: skip if we can't identify it as important
  return false;
}

/**
 * Check if content appears to be a config file
 */
function isConfigFile(content: string, language: string): boolean {
  if (language === 'json') {
    return (
      content.includes('package.json') ||
      content.includes('"name"') && content.includes('"version"') ||
      content.includes('"compilerOptions"') ||
      content.includes('tsconfig') ||
      content.includes('"extends"') && content.includes('"rules"')
    );
  }

  if (language === 'yaml' || language === 'yml') {
    return (
      content.includes('version:') ||
      content.includes('services:') ||
      content.includes('docker-compose') ||
      content.includes('name:') && content.includes('on:')
    );
  }

  return false;
}

/**
 * Check if content is a trivial example (should be skipped)
 */
function isTrivialExample(content: string, language: string): boolean {
  const trivialPatterns = [
    /console\.log\(['"]Hello/i,
    /print\(['"]Hello/i,
    /function\s+add\s*\(\s*a\s*,\s*b\s*\)/i,
    /def\s+add\s*\(\s*a\s*,\s*b\s*\)/i,
    /2\s*\+\s*2/,
    /foo|bar|baz/i,
    /example|demo|test123/i,
  ];

  // Check if content matches trivial patterns
  const matchesTrivialPattern = trivialPatterns.some(pattern => pattern.test(content));

  if (matchesTrivialPattern) {
    // Even if it matches, allow it if it's long and well-structured
    const lines = content.split('\n');
    const hasImports = /^import |^from .+ import |^require\(/.test(content);
    const hasExports = /^export |module\.exports/.test(content);

    if (lines.length > 30 && (hasImports || hasExports)) {
      return false; // Not trivial despite patterns
    }

    return true;
  }

  return false;
}

/**
 * Check if content appears to be a complete file
 */
function isCompleteFile(content: string, language: string): boolean {
  // Has explicit file path comment
  const hasFileComment = /(?:\/\/|#|\/\*)\s*(?:File:|Filename:|Path:|file:)\s*\S+/i.test(content);
  if (hasFileComment) return true;

  // JavaScript/TypeScript file indicators
  if (language === 'typescript' || language === 'javascript') {
    const hasImports = /^import\s+/m.test(content);
    const hasExports = /^export\s+/m.test(content);
    const hasReactComponent = /export\s+(?:default\s+)?(?:const|function)\s+[A-Z][a-zA-Z0-9]+/m.test(content);
    const hasHook = /export\s+(?:const|function)\s+use[A-Z][a-zA-Z0-9]+/m.test(content);
    const hasClass = /export\s+(?:default\s+)?class\s+[A-Z][a-zA-Z0-9]+/m.test(content);

    // Must have both imports and exports, or be a clear component/hook/class
    return (hasImports && hasExports) || hasReactComponent || hasHook || hasClass;
  }

  // Python file indicators
  if (language === 'python') {
    const hasClass = /^class\s+[A-Z][a-zA-Z0-9]+/m.test(content);
    const hasFunction = /^def\s+[a-z_][a-z0-9_]+/m.test(content);
    const hasImports = /^(?:import|from)\s+/m.test(content);
    const hasIfMain = /__name__\s*==\s*['"]__main__['"]/m.test(content);

    return (hasClass || (hasFunction && hasImports)) || hasIfMain;
  }

  // SQL migration/schema files
  if (language === 'sql') {
    const hasCreateTable = /CREATE\s+TABLE/i.test(content);
    const hasAlterTable = /ALTER\s+TABLE/i.test(content);
    const hasMigrationComment = /--.*(?:migration|Migration)/i.test(content);

    return hasCreateTable || hasAlterTable || hasMigrationComment;
  }

  // HTML files
  if (language === 'html') {
    const hasDoctype = /<!DOCTYPE/i.test(content);
    const hasHtmlTag = /<html/i.test(content);
    const hasHeadAndBody = /<head/i.test(content) && /<body/i.test(content);

    return hasDoctype || hasHtmlTag || hasHeadAndBody;
  }

  // CSS/SCSS files
  if (language === 'css' || language === 'scss') {
    const hasMultipleRules = (content.match(/\{[^}]+\}/g) || []).length >= 5;
    const hasImports = /@import/i.test(content);
    const hasVariables = /(?:--[a-z-]+:|@mixin|@function|\$[a-z-]+:)/i.test(content);

    return hasMultipleRules || hasImports || hasVariables;
  }

  return false;
}

/**
 * Check if content is substantial and meaningful
 */
function isSubstantialCode(content: string, language: string): boolean {
  const lines = content.split('\n');
  const lineCount = lines.length;

  // Must be at least moderately sized
  if (lineCount < 8) return false;

  // Check for code complexity indicators
  const hasFunctions = (content.match(/(?:function|def|fn|func)\s+\w+/g) || []).length >= 2;
  const hasClasses = /(?:class|interface|type)\s+[A-Z]/.test(content);
  const hasLogic = (content.match(/(?:if|else|switch|for|while|map|filter|reduce)/g) || []).length >= 3;
  const hasComments = (content.match(/(?:\/\/|#|\/\*)/g) || []).length >= 3;

  // Code should have some structure and complexity
  return (hasFunctions || hasClasses) && hasLogic;
}

/**
 * Normalize language identifiers to standard names
 */
function normalizeLanguage(lang: string): string {
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'ts': 'typescript',
    'jsx': 'javascript',
    'tsx': 'typescript',
    'py': 'python',
    'rb': 'ruby',
    'sh': 'bash',
    'shell': 'bash',
    'yml': 'yaml',
    'md': 'markdown',
    'txt': 'plaintext',
  };

  const normalized = lang.toLowerCase();
  return languageMap[normalized] || normalized;
}

/**
 * Detect accurate file name from code content using advanced pattern matching
 */
export function detectFileType(content: string, language: string): string | null {
  // 1. Check for explicit file path comments (highest priority)
  const filePatterns = [
    /\/\/\s*(?:File:|Filename:|Path:)\s*(.+)/i,
    /#\s*(?:File:|Filename:|Path:)\s*(.+)/i,
    /\/\*\s*(?:File:|Filename:|Path:)\s*(.+?)\s*\*\//i,
  ];

  for (const pattern of filePatterns) {
    const match = content.match(pattern);
    if (match) {
      const filename = match[1].trim();
      // Extract just the filename if a full path is provided
      const parts = filename.split('/');
      return parts[parts.length - 1];
    }
  }

  // 2. Language-specific pattern detection
  const normalizedLang = language.toLowerCase();

  if (normalizedLang === 'typescript' || normalizedLang === 'javascript') {
    return detectJavaScriptFileName(content, normalizedLang);
  }

  if (normalizedLang === 'python') {
    return detectPythonFileName(content);
  }

  if (normalizedLang === 'sql') {
    return detectSQLFileName(content);
  }

  if (normalizedLang === 'json') {
    return detectJSONFileName(content);
  }

  if (normalizedLang === 'html') {
    return 'index.html';
  }

  if (normalizedLang === 'css' || normalizedLang === 'scss') {
    return detectCSSFileName(content, normalizedLang);
  }

  return null;
}

/**
 * Detect JavaScript/TypeScript file names from code structure
 */
function detectJavaScriptFileName(content: string, language: string): string | null {
  const ext = language === 'typescript' ? 'ts' : 'js';

  // React component (with JSX/TSX)
  const hasJSX = /<[A-Z]/.test(content);
  const jsxExt = hasJSX ? (language === 'typescript' ? 'tsx' : 'jsx') : ext;

  // 1. React functional component with export
  let match = content.match(/export\s+(?:default\s+)?(?:const|function)\s+([A-Z][a-zA-Z0-9]+)(?:\s*[:=]|\()/m);
  if (match) {
    return `${match[1]}.${jsxExt}`;
  }

  // 2. React component without export keyword nearby
  match = content.match(/(?:const|function)\s+([A-Z][a-zA-Z0-9]+)(?:\s*[:=].*React\.FC|\s*=\s*\([^)]*\)\s*=>)/m);
  if (match) {
    return `${match[1]}.${jsxExt}`;
  }

  // 3. Custom hooks (useXxx)
  match = content.match(/export\s+(?:const|function)\s+(use[A-Z][a-zA-Z0-9]+)/m);
  if (match) {
    return `${match[1]}.${ext}`;
  }

  // 4. Hooks without export keyword
  match = content.match(/(?:const|function)\s+(use[A-Z][a-zA-Z0-9]+)/m);
  if (match) {
    return `${match[1]}.${ext}`;
  }

  // 5. Class definition
  match = content.match(/export\s+(?:default\s+)?class\s+([A-Z][a-zA-Z0-9]+)/m);
  if (match) {
    return `${match[1]}.${ext}`;
  }

  // 6. Named exports of types/interfaces
  match = content.match(/export\s+(?:interface|type)\s+([A-Z][a-zA-Z0-9]+)/m);
  if (match) {
    return `${match[1]}.${ext}`;
  }

  // 7. Default exported function
  match = content.match(/export\s+default\s+function\s+([a-zA-Z][a-zA-Z0-9]+)/m);
  if (match) {
    return `${match[1]}.${ext}`;
  }

  // 8. Named function export
  match = content.match(/export\s+(?:async\s+)?function\s+([a-z][a-zA-Z0-9]+)/m);
  if (match) {
    return `${match[1]}.${ext}`;
  }

  // 9. Const export (utilities)
  match = content.match(/export\s+const\s+([a-z][a-zA-Z0-9]+)/m);
  if (match) {
    return `${match[1]}.${ext}`;
  }

  return null;
}

/**
 * Detect Python file names from code structure
 */
function detectPythonFileName(content: string): string | null {
  // 1. Class definition
  let match = content.match(/class\s+([A-Z][a-zA-Z0-9]+)/m);
  if (match) {
    // Convert PascalCase to snake_case
    const snakeCase = match[1].replace(/([A-Z])/g, (_, c, i) =>
      i === 0 ? c.toLowerCase() : `_${c.toLowerCase()}`
    );
    return `${snakeCase}.py`;
  }

  // 2. Function definition
  match = content.match(/def\s+([a-z_][a-z0-9_]+)\(/m);
  if (match && match[1] !== '__init__' && match[1] !== '__main__') {
    return `${match[1]}.py`;
  }

  return null;
}

/**
 * Detect SQL file names from SQL content
 */
function detectSQLFileName(content: string): string | null {
  // 1. CREATE TABLE statement
  let match = content.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\w+\.)?(\w+)/i);
  if (match) {
    return `${match[1]}.sql`;
  }

  // 2. ALTER TABLE statement
  match = content.match(/ALTER\s+TABLE\s+(?:\w+\.)?(\w+)/i);
  if (match) {
    return `alter_${match[1]}.sql`;
  }

  // 3. CREATE INDEX statement
  match = content.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
  if (match) {
    return `index_${match[1]}.sql`;
  }

  // 4. Check for migration comment pattern
  match = content.match(/--\s*(?:migration|Migration):\s*(.+)/i);
  if (match) {
    const name = match[1].trim().replace(/\s+/g, '_').toLowerCase();
    return `${name}.sql`;
  }

  return null;
}

/**
 * Detect JSON file names from content
 */
function detectJSONFileName(content: string): string | null {
  if (content.includes('"name"') && content.includes('"version"') && content.includes('"dependencies"')) {
    return 'package.json';
  }

  if (content.includes('"compilerOptions"')) {
    return 'tsconfig.json';
  }

  if (content.includes('"plugins"') && content.includes('"theme"')) {
    return 'tailwind.config.json';
  }

  if (content.includes('"extends"') && content.includes('"rules"')) {
    return 'eslint.config.json';
  }

  return null;
}

/**
 * Detect CSS/SCSS file names from content
 */
function detectCSSFileName(content: string, language: string): string | null {
  const ext = language === 'scss' ? 'scss' : 'css';

  // Check for root styles
  if (content.includes(':root') || content.includes('html') || content.includes('body')) {
    return `index.${ext}`;
  }

  // Check for component-specific class
  const match = content.match(/\.([a-z][a-z-]+)\s*{/m);
  if (match) {
    return `${match[1]}.${ext}`;
  }

  return null;
}

/**
 * Generate a preview of code content (first N lines)
 */
export function generateCodePreview(content: string, maxLines: number = 3): string {
  const lines = content.split('\n');
  const previewLines = lines.slice(0, maxLines);
  const hasMore = lines.length > maxLines;

  return previewLines.join('\n') + (hasMore ? '\n...' : '');
}

/**
 * Group code blocks by language
 */
export function groupBlocksByLanguage(blocks: ExtractedCodeBlock[]): Map<string, ExtractedCodeBlock[]> {
  const grouped = new Map<string, ExtractedCodeBlock[]>();

  for (const block of blocks) {
    const existing = grouped.get(block.language) || [];
    existing.push(block);
    grouped.set(block.language, existing);
  }

  return grouped;
}

/**
 * Get display name for language
 */
export function getLanguageDisplayName(language: string): string {
  const displayNames: Record<string, string> = {
    'javascript': 'JavaScript',
    'typescript': 'TypeScript',
    'python': 'Python',
    'java': 'Java',
    'cpp': 'C++',
    'csharp': 'C#',
    'go': 'Go',
    'rust': 'Rust',
    'ruby': 'Ruby',
    'php': 'PHP',
    'swift': 'Swift',
    'kotlin': 'Kotlin',
    'sql': 'SQL',
    'html': 'HTML',
    'css': 'CSS',
    'scss': 'SCSS',
    'json': 'JSON',
    'yaml': 'YAML',
    'xml': 'XML',
    'markdown': 'Markdown',
    'bash': 'Bash',
    'shell': 'Shell',
    'plaintext': 'Plain Text',
  };

  return displayNames[language.toLowerCase()] || language.toUpperCase();
}
