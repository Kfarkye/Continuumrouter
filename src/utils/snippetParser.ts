export interface ParsedSnippet {
  name: string;
  content: string;
  type: 'component' | 'hook' | 'utility' | 'type' | 'interface' | 'class' | 'function' | 'constant' | 'sql' | 'unknown';
  description?: string;
  imports: string[];
  exports: string[];
  dependencies: string[];
  tags: string[];
}

export function parseTypeScriptSnippet(code: string): ParsedSnippet {
  const trimmed = code.trim();

  if (isSQLSchema(trimmed)) {
    return parseSQLSchema(trimmed);
  }

  const imports = extractImports(trimmed);
  const dependencies = extractDependencies(imports);
  const exports = extractExports(trimmed);

  const type = detectSnippetType(trimmed);
  const name = extractName(trimmed, type);
  const description = extractDescription(trimmed);
  const tags = generateTags(trimmed, type, dependencies);

  const cleanedContent = cleanupSnippet(trimmed);

  return {
    name,
    content: cleanedContent,
    type,
    description,
    imports,
    exports,
    dependencies,
    tags,
  };
}

function isSQLSchema(code: string): boolean {
  return /create\s+table/i.test(code) || /alter\s+table/i.test(code);
}

function parseSQLSchema(code: string): ParsedSnippet {
  const tableName = extractTableName(code);
  const description = extractSQLDescription(code);
  const tags = generateSQLTags(code);

  return {
    name: tableName || 'Untitled SQL Schema',
    content: code.trim(),
    type: 'sql',
    description,
    imports: [],
    exports: [],
    dependencies: [],
    tags,
  };
}

function extractTableName(sql: string): string | null {
  const createTableMatch = sql.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)/i);
  if (createTableMatch) {
    return createTableMatch[1];
  }

  const alterTableMatch = sql.match(/alter\s+table\s+(?:public\.)?(\w+)/i);
  if (alterTableMatch) {
    return alterTableMatch[1];
  }

  return null;
}

function extractSQLDescription(sql: string): string | undefined {
  const commentMatch = sql.match(/--\s*(.+?)(?:\n|$)/);
  if (commentMatch) {
    return commentMatch[1].trim();
  }

  const blockCommentMatch = sql.match(/\/\*\s*([^*]|\*(?!\/))+\*\//);
  if (blockCommentMatch) {
    const lines = blockCommentMatch[0]
      .replace(/^\/\*\s*/, '')
      .replace(/\s*\*\/$/, '')
      .split('\n')
      .map(line => line.replace(/^\s*\*?\s*/, '').trim())
      .filter(line => line.length > 0);
    return lines.join(' ').substring(0, 200);
  }

  return undefined;
}

function generateSQLTags(sql: string): string[] {
  const tags = new Set<string>(['sql', 'database', 'schema']);

  if (/create\s+table/i.test(sql)) tags.add('table');
  if (/create\s+index/i.test(sql)) tags.add('index');
  if (/constraint/i.test(sql)) tags.add('constraint');
  if (/foreign\s+key/i.test(sql)) tags.add('foreign-key');
  if (/primary\s+key/i.test(sql)) tags.add('primary-key');
  if (/references/i.test(sql)) tags.add('relationship');
  if (/alter\s+table/i.test(sql)) tags.add('migration');
  if (/on\s+delete\s+cascade/i.test(sql)) tags.add('cascade');
  if (/unique/i.test(sql)) tags.add('unique');
  if (/not\s+null/i.test(sql)) tags.add('validation');

  return Array.from(tags);
}

function extractImports(code: string): string[] {
  const importRegex = /import\s+(?:{[^}]+}|[\w*]+)(?:\s+as\s+\w+)?\s+from\s+['"]([^'"]+)['"]/g;
  const imports: string[] = [];
  let match;

  while ((match = importRegex.exec(code)) !== null) {
    imports.push(match[0]);
  }

  return imports;
}

function extractDependencies(imports: string[]): string[] {
  const deps = new Set<string>();

  imports.forEach(imp => {
    const match = imp.match(/from\s+['"]([^'"]+)['"]/);
    if (match) {
      const pkg = match[1];
      if (!pkg.startsWith('.') && !pkg.startsWith('/')) {
        const pkgName = pkg.startsWith('@')
          ? pkg.split('/').slice(0, 2).join('/')
          : pkg.split('/')[0];
        deps.add(pkgName);
      }
    }
  });

  return Array.from(deps);
}

function extractExports(code: string): string[] {
  const exports: string[] = [];

  const defaultExportMatch = code.match(/export\s+default\s+(?:function\s+)?(\w+)/);
  if (defaultExportMatch) {
    exports.push(defaultExportMatch[1]);
  }

  const namedExportRegex = /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
  let match;

  while ((match = namedExportRegex.exec(code)) !== null) {
    exports.push(match[1]);
  }

  const exportListRegex = /export\s+{\s*([^}]+)\s*}/g;
  while ((match = exportListRegex.exec(code)) !== null) {
    const items = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]);
    exports.push(...items);
  }

  return exports;
}

function detectSnippetType(code: string): ParsedSnippet['type'] {
  if (/(?:const|function)\s+use[A-Z]\w+/.test(code)) return 'hook';

  if (/(?:const|function)\s+[A-Z]\w+.*(?:React\.FC|React\.Component|:\s*React\.FC|extends\s+(?:React\.)?Component)/.test(code)) {
    return 'component';
  }

  if (/(?:export\s+)?interface\s+[A-Z]\w+/.test(code)) return 'interface';

  if (/(?:export\s+)?type\s+[A-Z]\w+/.test(code)) return 'type';

  if (/(?:export\s+)?class\s+[A-Z]\w+/.test(code)) return 'class';

  if (/(?:export\s+)?(?:const|let|var)\s+[A-Z_][A-Z0-9_]+\s*=/.test(code)) return 'constant';

  if (/(?:export\s+)?(?:async\s+)?function\s+\w+/.test(code)) return 'function';

  if (/(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*\([^)]*\)\s*=>/.test(code)) return 'function';

  if (/^(?:export\s+)?(?:const|let|var)\s+\w+.*=.*{/.test(code)) return 'utility';

  return 'unknown';
}

function extractName(code: string, type: ParsedSnippet['type']): string {
  let match;

  match = code.match(/export\s+default\s+(?:function\s+)?(\w+)/);
  if (match) return match[1];

  if (type === 'component') {
    match = code.match(/(?:const|function)\s+([A-Z]\w+)(?:\s*[:=]|\()/);
    if (match) return match[1];
  }

  if (type === 'hook') {
    match = code.match(/(?:const|function)\s+(use[A-Z]\w+)/);
    if (match) return match[1];
  }

  if (type === 'interface' || type === 'type') {
    match = code.match(/(?:interface|type)\s+([A-Z]\w+)/);
    if (match) return match[1];
  }

  if (type === 'class') {
    match = code.match(/class\s+([A-Z]\w+)/);
    if (match) return match[1];
  }

  match = code.match(/(?:export\s+)?(?:const|let|var|function)\s+(\w+)/);
  if (match) return match[1];

  return 'Untitled';
}

function extractDescription(code: string): string | undefined {
  const jsdocMatch = code.match(/\/\*\*\s*\n\s*\*\s*([^\n*]+)/);
  if (jsdocMatch) {
    return jsdocMatch[1].trim();
  }

  const singleLineMatch = code.match(/^\/\/\s*(.+)$/m);
  if (singleLineMatch && singleLineMatch[1].length < 100) {
    return singleLineMatch[1].trim();
  }

  return undefined;
}

function generateTags(code: string, type: ParsedSnippet['type'], dependencies: string[]): string[] {
  const tags = new Set<string>([type]);

  if (dependencies.includes('react')) tags.add('react');
  if (dependencies.includes('react-hook-form')) tags.add('forms');
  if (dependencies.includes('zod')) tags.add('validation');
  if (dependencies.includes('@tanstack/react-query')) tags.add('data-fetching');
  if (dependencies.includes('framer-motion')) tags.add('animation');

  if (/typescript/i.test(code)) tags.add('typescript');
  if (/\.tsx?['"]/.test(code)) tags.add('typescript');

  if (/useState|useEffect|useCallback|useMemo/.test(code)) tags.add('hooks');

  if (/async|await|Promise/.test(code)) tags.add('async');

  if (/api|fetch|axios/.test(code)) tags.add('api');

  if (/<[A-Z]\w+/.test(code)) tags.add('jsx');

  return Array.from(tags);
}

function cleanupSnippet(code: string): string {
  let cleaned = code.trim();

  cleaned = cleaned.replace(/^```(?:typescript|tsx|ts|javascript|jsx|js)?\n?/i, '');
  cleaned = cleaned.replace(/\n?```\s*$/, '');

  cleaned = cleaned.replace(/^\s*['"]use client['"]\s*;?\s*\n/m, '');

  return cleaned.trim();
}

export function formatSnippetForCopy(snippet: ParsedSnippet, options?: {
  includeImports?: boolean;
  includeComments?: boolean;
}): string {
  const { includeImports = true, includeComments = false } = options || {};

  let output = '';

  if (includeComments && snippet.description) {
    output += `/**\n * ${snippet.description}\n */\n`;
  }

  if (includeImports && snippet.imports.length > 0) {
    output += snippet.imports.join('\n') + '\n\n';
  }

  output += snippet.content;

  return output;
}
