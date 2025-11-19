// Utility for conditional class names (clsx alternative)
export const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(' ');
};

/**
 * Formats bytes into a human-readable string (KB, MB, GB).
 */
export const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

/**
 * Generates a temporary unique ID for client-side tracking (e.g., attachments).
 */
export const generateTempId = () => `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * Centralized File Extension Map (DRY)
 */
const FILE_EXTENSIONS_MAP: Record<string, string> = {
    // Schema formats
    typescript: 'ts', zod: 'ts', json_schema: 'json', sql_ddl: 'sql', prisma: 'prisma', openapi: 'yaml',
    // Programming languages
    javascript: 'js', jsx: 'jsx', tsx: 'tsx', python: 'py', java: 'java', cpp: 'cpp', csharp: 'cs',
    go: 'go', rust: 'rs', ruby: 'rb', php: 'php', html: 'html', css: 'css',
    json: 'json', yaml: 'yml', yml: 'yml', sql: 'sql', bash: 'sh', shell: 'sh', markdown: 'md', md: 'md', plaintext: 'txt', text: 'txt',
};

/**
 * Gets the appropriate file extension for a given language or format identifier.
 */
export const getFileExtension = (languageOrFormat: string): string => {
    return FILE_EXTENSIONS_MAP[languageOrFormat?.toLowerCase()] || 'txt';
};

/**
 * Triggers a browser download for the given content.
 */
export const triggerDownload = (content: string, fileName: string, type: string = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

/**
 * Language Display Names Map
 */
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
    javascript: 'JavaScript',
    js: 'JavaScript',
    typescript: 'TypeScript',
    ts: 'TypeScript',
    jsx: 'JSX',
    tsx: 'TSX',
    python: 'Python',
    py: 'Python',
    java: 'Java',
    cpp: 'C++',
    c: 'C',
    csharp: 'C#',
    cs: 'C#',
    go: 'Go',
    rust: 'Rust',
    rs: 'Rust',
    ruby: 'Ruby',
    rb: 'Ruby',
    php: 'PHP',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    sass: 'Sass',
    json: 'JSON',
    yaml: 'YAML',
    yml: 'YAML',
    sql: 'SQL',
    bash: 'Bash',
    shell: 'Shell',
    sh: 'Shell',
    markdown: 'Markdown',
    md: 'Markdown',
    plaintext: 'Plain Text',
    text: 'Plain Text',
    txt: 'Text',
    xml: 'XML',
    graphql: 'GraphQL',
    swift: 'Swift',
    kotlin: 'Kotlin',
    dart: 'Dart',
    vue: 'Vue',
    svelte: 'Svelte',
    dockerfile: 'Dockerfile',
    makefile: 'Makefile',
};

/**
 * Gets a human-readable display name for a programming language identifier.
 */
export const getLanguageDisplayName = (language: string): string => {
    const normalized = language?.toLowerCase().trim();
    return LANGUAGE_DISPLAY_NAMES[normalized] || language.charAt(0).toUpperCase() + language.slice(1);
};
