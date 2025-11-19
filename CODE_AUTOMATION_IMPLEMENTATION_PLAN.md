# Code Generation Automation - Implementation Plan

## Executive Summary

Transform the existing DeepThink architecture into a code generation automation system that produces isolated, well-defined code units (Edge Functions, database migrations, React components) with three-layer verification (static analysis, LLM verification, sandbox execution).

## Architecture Overview

### Current DeepThink Pipeline
```
User Goal → Planner → Evidence → Parallel Solvers → Verifier → Winner Selection
```

### Enhanced Code Generation Pipeline
```
Goal + Context → Code-Aware Planner → Pattern Evidence → Specialized Code Solvers → 3-Layer Verification → Artifact Storage
```

## Phase 1: Database Schema Extensions

### 1.1 Automation Jobs Table

**Purpose**: Track code generation requests with full context and lifecycle

```sql
CREATE TABLE automation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  space_run_id uuid REFERENCES space_runs(id),

  -- Job Specification
  goal_description text NOT NULL,
  generation_type text NOT NULL CHECK (generation_type IN (
    'edge_function',
    'database_migration',
    'react_component',
    'api_endpoint',
    'test_file'
  )),

  -- Technical Context (from user)
  schema_definitions jsonb DEFAULT '{}',
  dependencies text[] DEFAULT '{}',
  acceptance_criteria text[] DEFAULT '{}',
  target_file_path text,

  -- Generation Metadata
  detected_patterns jsonb DEFAULT '{}',
  template_id uuid REFERENCES automation_templates(id),
  estimated_tokens integer,

  -- Results
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'planning',
    'generating',
    'verifying',
    'completed',
    'failed',
    'rejected'
  )),

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,

  -- Performance Tracking
  total_tokens integer DEFAULT 0,
  total_cost_usd numeric(10,6) DEFAULT 0,
  generation_time_ms integer
);

-- RLS Policies
ALTER TABLE automation_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own automation jobs"
  ON automation_jobs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create automation jobs"
  ON automation_jobs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_automation_jobs_user_status ON automation_jobs(user_id, status);
CREATE INDEX idx_automation_jobs_created ON automation_jobs(created_at DESC);
```

### 1.2 Generated Artifacts Table

**Purpose**: Store generated code files with versioning and metadata

```sql
CREATE TABLE generated_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_job_id uuid REFERENCES automation_jobs(id) ON DELETE CASCADE,
  ai_run_id uuid REFERENCES ai_runs(id),

  -- File Information
  file_path text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN (
    'typescript',
    'tsx',
    'sql',
    'json',
    'markdown'
  )),

  -- Code Content
  code_content text NOT NULL,
  original_content text, -- If modifying existing file

  -- Generation Details
  solver_variant jsonb,
  confidence_score numeric(3,2),

  -- Verification Results
  static_analysis_results jsonb DEFAULT '{}',
  llm_verification_results jsonb DEFAULT '{}',
  execution_test_results jsonb DEFAULT '{}',

  -- Status
  status text NOT NULL DEFAULT 'generated' CHECK (status IN (
    'generated',
    'verified',
    'applied',
    'rejected',
    'rolled_back'
  )),

  -- Metadata
  lines_of_code integer,
  character_count integer,
  import_count integer,

  created_at timestamptz DEFAULT now(),
  applied_at timestamptz,

  -- Version Control
  git_branch text,
  git_commit_sha text
);

-- RLS Policies
ALTER TABLE generated_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own artifacts"
  ON generated_artifacts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM automation_jobs
      WHERE automation_jobs.id = generated_artifacts.automation_job_id
      AND automation_jobs.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX idx_artifacts_job ON generated_artifacts(automation_job_id);
CREATE INDEX idx_artifacts_status ON generated_artifacts(status);
CREATE INDEX idx_artifacts_file_path ON generated_artifacts(file_path);
```

### 1.3 Automation Templates Table

**Purpose**: Store reusable code generation patterns and prompts

```sql
CREATE TABLE automation_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template Identification
  name text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN (
    'edge_function',
    'database_migration',
    'react_component',
    'api_endpoint',
    'test_file'
  )),

  -- Template Content
  description text,
  system_prompt text NOT NULL,
  example_inputs jsonb DEFAULT '[]',
  example_outputs jsonb DEFAULT '[]',

  -- Pattern Matching
  required_dependencies text[] DEFAULT '{}',
  file_name_pattern text,

  -- Quality Metrics
  usage_count integer DEFAULT 0,
  success_rate numeric(3,2) DEFAULT 0,
  avg_confidence numeric(3,2) DEFAULT 0,

  -- Metadata
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS: Templates are publicly readable
ALTER TABLE automation_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Templates are readable by authenticated users"
  ON automation_templates FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Indexes
CREATE INDEX idx_templates_category ON automation_templates(category);
CREATE INDEX idx_templates_active ON automation_templates(is_active);
```

### 1.4 Pattern Library Table

**Purpose**: Store extracted patterns from existing codebase

```sql
CREATE TABLE codebase_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  project_id uuid REFERENCES projects(id),

  -- Pattern Information
  pattern_type text NOT NULL CHECK (pattern_type IN (
    'import_style',
    'naming_convention',
    'error_handling',
    'cors_config',
    'type_definition',
    'component_structure'
  )),

  -- Pattern Content
  pattern_name text NOT NULL,
  pattern_example text NOT NULL,
  pattern_frequency integer DEFAULT 1,

  -- Context
  source_files text[] DEFAULT '{}',
  detected_at timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),

  -- Usage Tracking
  usage_count integer DEFAULT 0
);

-- RLS Policies
ALTER TABLE codebase_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own patterns"
  ON codebase_patterns FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_patterns_user_project ON codebase_patterns(user_id, project_id);
CREATE INDEX idx_patterns_type ON codebase_patterns(pattern_type);
```

## Phase 2: Enhanced Planning System

### 2.1 Code-Aware Planner Prompt

**Location**: `supabase/functions/deepthink/prompts/code-planner.ts`

```typescript
export const codePlannerSystemPrompt = `You are a code generation planning AI for DeepThink Code Automation.

Your job is to analyze the user's code generation goal and create a detailed technical plan.

INPUT STRUCTURE:
- goal: Natural language description of what to build
- context: {
    schema_definitions: TypeScript interfaces or SQL schemas
    dependencies: Available npm packages
    acceptance_criteria: Specific requirements
  }

OUTPUT JSON SCHEMA:
{
  "goal_restatement": "Clear technical description",
  "generation_type": "edge_function|database_migration|react_component",
  "approach": "High-level implementation strategy",
  "technical_considerations": [
    "TypeScript types needed",
    "Error handling approach",
    "Security considerations",
    "Performance optimizations"
  ],
  "required_imports": ["@supabase/supabase-js", "..."],
  "file_structure": {
    "file_name": "suggested-name.ts",
    "exports": ["main function", "..."],
    "key_sections": ["validation", "business logic", "response"]
  },
  "estimated_lines": 150,
  "complexity_score": 0.7,
  "requires_evidence": true,
  "evidence_keywords": ["cors", "edge function pattern", "supabase client"]
}

CRITICAL RULES:
1. Always validate that required dependencies are available
2. Consider security implications (RLS, input validation, CORS)
3. Match existing project patterns when possible
4. Identify any missing information in acceptance_criteria
5. Estimate token usage based on complexity
`;
```

### 2.2 Planner Enhancement Logic

**Location**: `supabase/functions/deepthink/code-planner.ts`

```typescript
interface CodeGenerationContext {
  schema_definitions?: string;
  dependencies?: string[];
  acceptance_criteria?: string[];
  target_file_path?: string;
}

interface CodePlan {
  goal_restatement: string;
  generation_type: 'edge_function' | 'database_migration' | 'react_component';
  approach: string;
  technical_considerations: string[];
  required_imports: string[];
  file_structure: {
    file_name: string;
    exports: string[];
    key_sections: string[];
  };
  estimated_lines: number;
  complexity_score: number;
  requires_evidence: boolean;
  evidence_keywords?: string[];
}

export async function createCodeGenerationPlan(
  goal: string,
  context: CodeGenerationContext
): Promise<CodePlan> {
  // 1. Analyze generation type from goal
  const generationType = detectGenerationType(goal);

  // 2. Validate dependencies
  const missingDeps = validateDependencies(
    context.dependencies || [],
    generationType
  );

  if (missingDeps.length > 0) {
    throw new Error(`Missing required dependencies: ${missingDeps.join(', ')}`);
  }

  // 3. Build enhanced prompt with context
  const enhancedPrompt = buildEnhancedPrompt(goal, context, generationType);

  // 4. Call planner LLM
  const plan = await callPlannerLLM(enhancedPrompt);

  // 5. Validate plan completeness
  validatePlan(plan, context.acceptance_criteria || []);

  return plan;
}

function detectGenerationType(goal: string): string {
  const keywords = {
    edge_function: ['edge function', 'api', 'endpoint', 'webhook', 'handler'],
    database_migration: ['database', 'table', 'migration', 'schema', 'rls'],
    react_component: ['component', 'ui', 'interface', 'page', 'view']
  };

  // Keyword matching logic
  for (const [type, words] of Object.entries(keywords)) {
    if (words.some(w => goal.toLowerCase().includes(w))) {
      return type;
    }
  }

  return 'edge_function'; // Default
}
```

## Phase 3: Pattern Evidence Gathering

### 3.1 Codebase Pattern Scanner

**Location**: `supabase/functions/deepthink/pattern-scanner.ts`

```typescript
export interface CodebasePattern {
  pattern_type: string;
  pattern_name: string;
  pattern_example: string;
  source_files: string[];
}

export async function scanCodebasePatterns(
  projectId: string,
  generationType: string
): Promise<CodebasePattern[]> {
  const patterns: CodebasePattern[] = [];

  switch (generationType) {
    case 'edge_function':
      patterns.push(...await scanEdgeFunctionPatterns());
      break;
    case 'database_migration':
      patterns.push(...await scanMigrationPatterns());
      break;
    case 'react_component':
      patterns.push(...await scanComponentPatterns());
      break;
  }

  return patterns;
}

async function scanEdgeFunctionPatterns(): Promise<CodebasePattern[]> {
  // Scan existing edge functions for patterns
  const patterns: CodebasePattern[] = [];

  // Example: CORS pattern
  patterns.push({
    pattern_type: 'cors_config',
    pattern_name: 'Standard CORS Headers',
    pattern_example: `const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};`,
    source_files: ['deepthink/index.ts', 'ai-chat-router/index.ts']
  });

  // Example: Import pattern
  patterns.push({
    pattern_type: 'import_style',
    pattern_name: 'Supabase Import',
    pattern_example: 'import { createClient } from "jsr:@supabase/supabase-js@2";',
    source_files: ['deepthink/index.ts', 'memory-lanes/index.ts']
  });

  return patterns;
}
```

### 3.2 Evidence Formatter

**Location**: `supabase/functions/deepthink/evidence-formatter.ts`

```typescript
export function formatCodePatternsForPrompt(patterns: CodebasePattern[]): string {
  if (patterns.length === 0) return '';

  let formatted = '\n## EXISTING PROJECT PATTERNS\n\n';
  formatted += 'Follow these patterns from the existing codebase:\n\n';

  for (const pattern of patterns) {
    formatted += `### ${pattern.pattern_name}\n`;
    formatted += `Type: ${pattern.pattern_type}\n`;
    formatted += `Found in: ${pattern.source_files.join(', ')}\n\n`;
    formatted += '```typescript\n';
    formatted += pattern.pattern_example;
    formatted += '\n```\n\n';
  }

  return formatted;
}
```

## Phase 4: Specialized Code Solvers

### 4.1 Edge Function Solver Prompt

**Location**: `supabase/functions/deepthink/prompts/edge-function-solver.ts`

```typescript
export function buildEdgeFunctionSolverPrompt(
  goal: string,
  plan: CodePlan,
  patterns: CodebasePattern[],
  context: CodeGenerationContext
): string {
  return `You are generating a Supabase Edge Function.

## GOAL
${goal}

## TECHNICAL PLAN
${JSON.stringify(plan, null, 2)}

${formatCodePatternsForPrompt(patterns)}

## PROVIDED SCHEMAS
${context.schema_definitions || 'None provided'}

## REQUIRED DEPENDENCIES
${context.dependencies?.join(', ') || 'None specified'}

## ACCEPTANCE CRITERIA
${context.acceptance_criteria?.map((c, i) => `${i + 1}. ${c}`).join('\n') || 'None specified'}

## OUTPUT FORMAT

Provide your solution as JSON:

{
  "file_name": "function-name.ts",
  "code_content": "// Complete TypeScript code here",
  "imports": ["jsr:@supabase/supabase-js@2", "..."],
  "exports": ["main handler"],
  "reasoning_steps": [
    {
      "step_number": 1,
      "description": "Setup CORS and imports",
      "code_section": "lines 1-10",
      "rationale": "Following project CORS pattern"
    }
  ],
  "confidence": 0.9,
  "security_considerations": [
    "Using RLS policies",
    "Input validation with Zod"
  ],
  "test_suggestions": [
    "Test OPTIONS request returns correct CORS headers",
    "Test unauthorized request returns 401"
  ]
}

## CRITICAL REQUIREMENTS

1. **Deno Imports**: MUST use jsr: or npm: prefixes (e.g., "jsr:@supabase/supabase-js@2")
2. **CORS Headers**: MUST include complete CORS configuration matching project pattern
3. **Error Handling**: Wrap main logic in try-catch block
4. **Input Validation**: Validate all inputs before processing
5. **Type Safety**: Use TypeScript types throughout
6. **Response Format**: Return consistent JSON responses
7. **Authentication**: Check user authentication when required

## EXAMPLE STRUCTURE

\`\`\`typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  // Handle OPTIONS for CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Your logic here

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
\`\`\`
`;
}
```

### 4.2 Database Migration Solver Prompt

**Location**: `supabase/functions/deepthink/prompts/migration-solver.ts`

```typescript
export function buildMigrationSolverPrompt(
  goal: string,
  plan: CodePlan,
  patterns: CodebasePattern[],
  context: CodeGenerationContext
): string {
  return `You are generating a PostgreSQL database migration for Supabase.

## GOAL
${goal}

## TECHNICAL PLAN
${JSON.stringify(plan, null, 2)}

${formatCodePatternsForPrompt(patterns)}

## OUTPUT FORMAT

{
  "file_name": "YYYYMMDD_descriptive_name.sql",
  "sql_content": "-- Complete SQL here",
  "reasoning_steps": [...],
  "confidence": 0.9,
  "safety_notes": [
    "Migration is idempotent",
    "RLS policies are restrictive"
  ]
}

## CRITICAL REQUIREMENTS

1. **Comments**: Start with detailed markdown comment explaining changes
2. **Idempotency**: Use IF NOT EXISTS / IF EXISTS clauses
3. **RLS**: Enable Row Level Security on ALL new tables
4. **Policies**: Create restrictive policies checking auth.uid()
5. **Indexes**: Add indexes for frequently queried columns
6. **Constraints**: Use CHECK constraints for data validation
7. **Defaults**: Provide meaningful default values
8. **No Transactions**: Do NOT use BEGIN/COMMIT (except in DO $$ blocks)

## EXAMPLE STRUCTURE

\`\`\`sql
/*
  # Add user profiles table

  1. New Tables
    - \`user_profiles\`
      - \`id\` (uuid, primary key, references auth.users)
      - \`display_name\` (text, required)
      - \`avatar_url\` (text, optional)
      - \`bio\` (text, optional)
      - \`created_at\` (timestamptz)
      - \`updated_at\` (timestamptz)

  2. Security
    - Enable RLS on \`user_profiles\`
    - Users can read all profiles
    - Users can only update their own profile
*/

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  avatar_url text,
  bio text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_display_name
  ON user_profiles(display_name);
\`\`\`
`;
}
```

## Phase 5: Three-Layer Verification

### 5.1 Layer 1: Static Analysis

**Location**: `supabase/functions/deepthink/verification/static-analysis.ts`

```typescript
export interface StaticCheckResult {
  check_name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
}

export function performStaticAnalysis(
  code: string,
  generationType: string,
  context: CodeGenerationContext
): StaticCheckResult[] {
  const results: StaticCheckResult[] = [];

  // Check 1: Syntax validation
  results.push(checkSyntax(code, generationType));

  // Check 2: Required imports
  results.push(checkRequiredImports(code, context.dependencies || []));

  // Check 3: Schema usage
  if (context.schema_definitions) {
    results.push(checkSchemaUsage(code, context.schema_definitions));
  }

  // Check 4: Forbidden patterns
  results.push(checkForbiddenPatterns(code, generationType));

  // Check 5: Security basics
  results.push(checkSecurityBasics(code, generationType));

  return results;
}

function checkSyntax(code: string, type: string): StaticCheckResult {
  try {
    if (type === 'edge_function' || type === 'react_component') {
      // Use TypeScript parser to validate syntax
      // This is a simplified check - full implementation would use ts.transpileModule
      const hasBasicStructure = code.includes('function') ||
                                 code.includes('=>') ||
                                 code.includes('const');

      if (!hasBasicStructure) {
        return {
          check_name: 'syntax_check',
          status: 'fail',
          message: 'Code does not contain valid function structure'
        };
      }
    }

    if (type === 'database_migration') {
      // Check for valid SQL keywords
      const sqlKeywords = ['CREATE', 'ALTER', 'INSERT', 'UPDATE', 'SELECT'];
      const hasSQL = sqlKeywords.some(kw => code.toUpperCase().includes(kw));

      if (!hasSQL) {
        return {
          check_name: 'syntax_check',
          status: 'fail',
          message: 'SQL code does not contain valid SQL commands'
        };
      }
    }

    return {
      check_name: 'syntax_check',
      status: 'pass',
      message: 'Basic syntax validation passed'
    };
  } catch (error) {
    return {
      check_name: 'syntax_check',
      status: 'fail',
      message: `Syntax error: ${error.message}`
    };
  }
}

function checkRequiredImports(code: string, dependencies: string[]): StaticCheckResult {
  const missingImports: string[] = [];

  for (const dep of dependencies) {
    // Check if dependency is imported
    const importPattern = new RegExp(`from\\s+["'\`][^"'\`]*${dep.replace('@', '\\@')}`, 'i');
    if (!importPattern.test(code)) {
      missingImports.push(dep);
    }
  }

  if (missingImports.length > 0) {
    return {
      check_name: 'import_check',
      status: 'fail',
      message: `Missing required imports: ${missingImports.join(', ')}`,
      details: { missing: missingImports }
    };
  }

  return {
    check_name: 'import_check',
    status: 'pass',
    message: 'All required dependencies are imported'
  };
}

function checkForbiddenPatterns(code: string, type: string): StaticCheckResult {
  const forbiddenPatterns: { pattern: RegExp; reason: string }[] = [];

  if (type === 'edge_function') {
    forbiddenPatterns.push(
      { pattern: /SUPABASE_SERVICE_ROLE_KEY/i, reason: 'Should not hardcode service role key' },
      { pattern: /eval\s*\(/i, reason: 'eval() is dangerous' },
      { pattern: /process\.env\./i, reason: 'Use Deno.env.get() instead' }
    );
  }

  if (type === 'database_migration') {
    forbiddenPatterns.push(
      { pattern: /DROP\s+TABLE(?!\s+IF\s+EXISTS)/i, reason: 'Use DROP TABLE IF EXISTS' },
      { pattern: /BEGIN\s*;/i, reason: 'Do not use explicit transactions' },
      { pattern: /COMMIT\s*;/i, reason: 'Do not use explicit transactions' }
    );
  }

  for (const { pattern, reason } of forbiddenPatterns) {
    if (pattern.test(code)) {
      return {
        check_name: 'forbidden_pattern',
        status: 'fail',
        message: `Forbidden pattern detected: ${reason}`
      };
    }
  }

  return {
    check_name: 'forbidden_pattern',
    status: 'pass',
    message: 'No forbidden patterns detected'
  };
}

function checkSecurityBasics(code: string, type: string): StaticCheckResult {
  const warnings: string[] = [];

  if (type === 'edge_function') {
    // Check for CORS
    if (!code.includes('Access-Control-Allow-Origin')) {
      warnings.push('Missing CORS headers');
    }

    // Check for error handling
    if (!code.includes('try') && !code.includes('catch')) {
      warnings.push('No error handling detected');
    }

    // Check for input validation
    if (code.includes('req.json()') && !code.includes('validate')) {
      warnings.push('Consider adding input validation');
    }
  }

  if (type === 'database_migration') {
    // Check for RLS
    if (code.includes('CREATE TABLE') && !code.includes('ENABLE ROW LEVEL SECURITY')) {
      warnings.push('Missing RLS on new table');
    }

    // Check for policies
    if (code.includes('ENABLE ROW LEVEL SECURITY') && !code.includes('CREATE POLICY')) {
      warnings.push('RLS enabled but no policies defined');
    }
  }

  if (warnings.length > 0) {
    return {
      check_name: 'security_basics',
      status: 'warning',
      message: `Security warnings: ${warnings.join(', ')}`,
      details: { warnings }
    };
  }

  return {
    check_name: 'security_basics',
    status: 'pass',
    message: 'Basic security checks passed'
  };
}
```

### 5.2 Layer 2: Enhanced LLM Verification

**Location**: `supabase/functions/deepthink/verification/llm-verifier.ts`

```typescript
export function buildCodeVerifierPrompt(
  goal: string,
  code: string,
  acceptanceCriteria: string[],
  generationType: string
): string {
  return `You are a code verification AI for DeepThink Code Automation.

## ORIGINAL GOAL
${goal}

## ACCEPTANCE CRITERIA
${acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## GENERATED CODE
\`\`\`typescript
${code}
\`\`\`

## YOUR TASK

Verify the generated code meets all requirements and is production-ready.

Evaluate these aspects:

1. **Correctness**: Does it solve the stated goal?
2. **Acceptance Criteria**: Does it meet all specified criteria?
3. **Security**: Are there vulnerabilities (SQL injection, XSS, auth bypass)?
4. **Error Handling**: Are errors handled properly?
5. **Type Safety**: Are types used correctly?
6. **Best Practices**: Does it follow ${generationType} best practices?
7. **Completeness**: Is any critical logic missing?

## OUTPUT FORMAT

{
  "verdict": "pass" | "fail",
  "confidence_score": 0.0 to 1.0,
  "checks": [
    {
      "check_name": "correctness",
      "status": "pass" | "fail",
      "message": "Explanation"
    }
  ],
  "security_issues": [
    "Issue description if any"
  ],
  "quality_score": 0.0 to 1.0,
  "improvement_suggestions": [
    "Optional suggestion for enhancement"
  ],
  "residual_risk": "Description of any remaining concerns"
}

## VERIFICATION RULES

- Set verdict to "fail" if ANY critical issue is found
- Critical issues: security vulnerabilities, missing core functionality, syntax errors
- Lower confidence_score for incomplete or unclear code
- Be strict but fair - production code must be reliable
`;
}
```

### 5.3 Layer 3: Sandbox Execution (Future)

**Location**: `supabase/functions/deepthink/verification/sandbox-executor.ts`

```typescript
// This is a placeholder for future implementation

export interface SandboxResult {
  success: boolean;
  build_output?: string;
  test_output?: string;
  errors?: string[];
  execution_time_ms: number;
}

/**
 * Future enhancement: Execute code in isolated Docker container
 *
 * Steps:
 * 1. Write generated code to temporary directory
 * 2. Spin up Docker container with project dependencies
 * 3. Run TypeScript compiler
 * 4. Run ESLint
 * 5. Execute tests if generated
 * 6. Return comprehensive results
 *
 * This provides the highest level of verification confidence
 */
export async function executeSandboxTests(
  code: string,
  generationType: string
): Promise<SandboxResult> {
  // TODO: Implement Docker-based sandbox execution
  throw new Error('Sandbox execution not yet implemented');
}
```

## Phase 6: Frontend Integration

### 6.1 Code Automation Interface

**Location**: `src/components/CodeAutomationInterface.tsx`

```typescript
import React, { useState } from 'react';
import { Code, Database, FileCode, Send } from 'lucide-react';
import { useCodeAutomation } from '../hooks/useCodeAutomation';

export const CodeAutomationInterface: React.FC = () => {
  const [goal, setGoal] = useState('');
  const [generationType, setGenerationType] = useState<'edge_function' | 'database_migration' | 'react_component'>('edge_function');
  const [context, setContext] = useState({
    schema_definitions: '',
    dependencies: [] as string[],
    acceptance_criteria: [] as string[]
  });

  const {
    isGenerating,
    currentPhase,
    plan,
    generatedCode,
    verificationResults,
    error,
    startGeneration,
    applyCode,
    reset
  } = useCodeAutomation();

  return (
    <div className="code-automation-container">
      {/* Input Form */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-h2 text-white/90 mb-4">Code Generation</h2>

        {/* Generation Type Selection */}
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => setGenerationType('edge_function')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl ${
              generationType === 'edge_function' ? 'bg-blue-500' : 'glass'
            }`}
          >
            <FileCode className="w-4 h-4" />
            Edge Function
          </button>
          <button
            onClick={() => setGenerationType('database_migration')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl ${
              generationType === 'database_migration' ? 'bg-blue-500' : 'glass'
            }`}
          >
            <Database className="w-4 h-4" />
            Migration
          </button>
          <button
            onClick={() => setGenerationType('react_component')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl ${
              generationType === 'react_component' ? 'bg-blue-500' : 'glass'
            }`}
          >
            <Code className="w-4 h-4" />
            Component
          </button>
        </div>

        {/* Goal Input */}
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Describe what you want to build..."
          className="chat-textarea mb-4"
          rows={4}
        />

        {/* Context Inputs (Optional) */}
        <details className="mb-4">
          <summary className="text-body text-white/70 cursor-pointer mb-2">
            Advanced Options (Optional)
          </summary>

          <div className="space-y-3 mt-3">
            <div>
              <label className="text-small text-white/60 block mb-1">
                Type Definitions / Schemas
              </label>
              <textarea
                value={context.schema_definitions}
                onChange={(e) => setContext(prev => ({ ...prev, schema_definitions: e.target.value }))}
                placeholder="interface User { id: string; name: string; }"
                className="chat-textarea"
                rows={4}
              />
            </div>

            <div>
              <label className="text-small text-white/60 block mb-1">
                Dependencies (comma-separated)
              </label>
              <input
                type="text"
                placeholder="@supabase/supabase-js, zod"
                className="chat-textarea"
                onChange={(e) => setContext(prev => ({
                  ...prev,
                  dependencies: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                }))}
              />
            </div>
          </div>
        </details>

        <button
          onClick={() => startGeneration(goal, generationType, context)}
          disabled={!goal.trim() || isGenerating}
          className="send-btn w-full"
        >
          <Send className="w-5 h-5" />
          Generate Code
        </button>
      </div>

      {/* Progress Display */}
      {currentPhase && (
        <div className="glass rounded-2xl p-4 mt-4">
          <div className="text-body text-white/90">{currentPhase.message}</div>
        </div>
      )}

      {/* Generated Code Preview */}
      {generatedCode && (
        <div className="glass rounded-2xl p-6 mt-4">
          <h3 className="text-h2 text-white/90 mb-3">Generated Code</h3>
          <pre className="bg-black/50 p-4 rounded-xl overflow-x-auto">
            <code>{generatedCode.code_content}</code>
          </pre>

          {verificationResults && (
            <div className="mt-4">
              <div className="text-body font-medium text-white/70 mb-2">
                Verification Results
              </div>
              {/* Display verification checks */}
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button
              onClick={applyCode}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 rounded-xl"
            >
              Apply Code
            </button>
            <button
              onClick={reset}
              className="px-4 py-2 glass hover:glass-heavy rounded-xl"
            >
              Start Over
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
```

## Phase 7: Testing Strategy

### 7.1 Test Cases

**Edge Function Generation:**
1. Simple GET endpoint with CORS
2. POST endpoint with Zod validation
3. Webhook handler with signature verification
4. Function with Supabase database access

**Database Migration:**
1. Single table with RLS
2. Table with foreign keys and indexes
3. Complex migration with multiple tables
4. Migration adding columns to existing table

**React Component:**
1. Simple display component
2. Form component with validation
3. Component with Supabase data fetching
4. Component matching existing design system

### 7.2 Success Metrics

- **Generation Success Rate**: % of generated code that passes all verification layers
- **First-Time Accuracy**: % of code accepted without modifications
- **Token Efficiency**: Average tokens per successful generation
- **Verification Accuracy**: % of LLM verifications that match sandbox results
- **User Acceptance**: % of generated code actually applied by users

## Phase 8: Deployment Checklist

- [ ] Apply database migrations for automation tables
- [ ] Insert automation templates for common patterns
- [ ] Deploy enhanced DeepThink edge function with code generation support
- [ ] Add code automation UI to main application
- [ ] Configure codebase pattern scanning
- [ ] Test with sample generations in each category
- [ ] Set up monitoring and metrics collection
- [ ] Document usage patterns and best practices
- [ ] Create tutorial for users

## Next Steps

1. **Immediate**: Implement database schema (automation_jobs, generated_artifacts, templates)
2. **Week 1**: Build static analysis layer and enhanced verifier prompts
3. **Week 2**: Create Edge Function solver and test generation pipeline
4. **Week 3**: Add pattern scanning and evidence gathering
5. **Week 4**: Build frontend interface and integrate with main app
6. **Week 5**: Test, refine, and prepare for production deployment

---

This plan transforms DeepThink into a sophisticated code generation system while maintaining its core strengths: multi-pass verification, evidence-based generation, parallel candidate evaluation, and cost-aware execution.
