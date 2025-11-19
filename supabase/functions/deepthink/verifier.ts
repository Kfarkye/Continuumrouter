import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { callGeminiJSON } from "./provider.ts";
import type { Usage } from "./util.ts";
import { logInfo } from "./util.ts";

export interface DeterministicCheckResult {
  check_name: string;
  status: "pass" | "fail" | "skip";
  reasoning: string;
}

export interface LLMVerificationResult {
  verdict: "pass" | "fail";
  score: number;
  residual_risk: string;
  checks: Array<{ check_name: string; status: "pass" | "fail"; reasoning: string }>;
  usage: Usage;
  latency_ms: number;
}

interface DeepThinkDraft {
  reasoning_steps: Array<{ step_number: number; description: string; conclusion: string; evidence_refs?: string[] }>;
  synthesis: string;
  confidence: number;
  citations_used: string[];
  assumptions?: string[];
  limitations?: string[];
}

export function deterministicChecks(goal: string, draft: DeepThinkDraft): DeterministicCheckResult[] {
  const checks: DeterministicCheckResult[] = [];
  checks.push({ check_name: "has_reasoning_steps", status: draft.reasoning_steps && draft.reasoning_steps.length > 0 ? "pass" : "fail", reasoning: draft.reasoning_steps ? `Found ${draft.reasoning_steps.length} reasoning steps` : "No reasoning steps provided" });
  checks.push({ check_name: "has_synthesis", status: draft.synthesis && draft.synthesis.length >= 50 ? "pass" : "fail", reasoning: draft.synthesis ? `Synthesis length: ${draft.synthesis.length} chars` : "Synthesis missing or too short" });
  checks.push({ check_name: "confidence_in_range", status: draft.confidence >= 0 && draft.confidence <= 1 ? "pass" : "fail", reasoning: `Confidence: ${draft.confidence}` });
  checks.push({ check_name: "has_citations", status: draft.citations_used && draft.citations_used.length > 0 ? "pass" : "skip", reasoning: draft.citations_used ? `${draft.citations_used.length} citations used` : "No citations (acceptable if no evidence provided)" });
  const citationPattern = /\[R(\d+)\]/g;
  const uniqueCitationsInText = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = citationPattern.exec(draft.synthesis)) !== null) {
    uniqueCitationsInText.add(`R${match[1]}`);
  }
  const uniqueCount = uniqueCitationsInText.size;
  const citationsMatch = uniqueCount === draft.citations_used.length;
  const noCitations = uniqueCount === 0 && draft.citations_used.length === 0;
  checks.push({ check_name: "citations_match", status: citationsMatch || noCitations ? "pass" : "fail", reasoning: `Found ${uniqueCount} unique in-text citations, declared ${draft.citations_used.length}` });
  checks.push({ check_name: "steps_sequential", status: areStepsSequential(draft.reasoning_steps) ? "pass" : "fail", reasoning: areStepsSequential(draft.reasoning_steps) ? "Steps are properly numbered" : "Steps are not sequential" });
  return checks;
}

function areStepsSequential(steps: DeepThinkDraft["reasoning_steps"]): boolean {
  if (!steps || steps.length === 0) return false;
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].step_number !== i + 1) return false;
  }
  return true;
}

export async function verifierLLM(goal: string, draft: DeepThinkDraft, model: string, threshold: number): Promise<LLMVerificationResult> {
  const systemPrompt = `You are a strict verifier for AI-generated reasoning outputs.\n\nYour job is to evaluate whether a proposed solution adequately addresses the user's goal.\n\nEvaluation Criteria:\n1. CORRECTNESS: Is the reasoning logically sound and factually accurate?\n2. COMPLETENESS: Does it fully address all aspects of the goal?\n3. CLARITY: Is the explanation clear and well-structured?\n4. EVIDENCE: Are citations used appropriately and accurately?\n5. LIMITATIONS: Are assumptions and limitations honestly acknowledged?\n\nScore from 0.0 (completely inadequate) to 1.0 (excellent).\nThreshold for acceptance: ${threshold}\n\nReturn a verdict of "pass" or "fail" based on the threshold.\nBe strict but fair. Minor issues are acceptable if the core solution is solid.`;
  const userPrompt = `GOAL:\n${goal}\n\nPROPOSED SOLUTION:\n${JSON.stringify(draft, null, 2)}\n\nEvaluate this solution and provide:\n1. verdict: "pass" or "fail"\n2. score: 0.0 to 1.0\n3. residual_risk: Brief description of remaining concerns or limitations\n4. checks: Array of specific check results`;
  const responseSchema = { type: "object", required: ["verdict", "score", "residual_risk", "checks"], properties: { verdict: { type: "string", enum: ["pass", "fail"] }, score: { type: "number", minimum: 0, maximum: 1 }, residual_risk: { type: "string" }, checks: { type: "array", items: { type: "object", required: ["check_name", "status", "reasoning"], properties: { check_name: { type: "string" }, status: { type: "string", enum: ["pass", "fail"] }, reasoning: { type: "string" } } } } } };
  logInfo("verifierLLM", `Verifying with ${model}`);
  const result = await callGeminiJSON<{ verdict: "pass" | "fail"; score: number; residual_risk: string; checks: Array<{ check_name: string; status: "pass" | "fail"; reasoning: string }> }>({ model, systemPrompt, userPrompt, responseSchema, temperature: 0.0, timeoutMs: 15000 });
  logInfo("verifierLLM", `Verdict: ${result.data.verdict}, Score: ${result.data.score}`);
  return { verdict: result.data.verdict, score: result.data.score, residual_risk: result.data.residual_risk, checks: result.data.checks, usage: result.usage, latency_ms: result.latency_ms };
}

export async function recordChecks(supabase: SupabaseClient, verifierRunId: string, candidateRunId: string, checks: Array<{ check_name: string; status: string; reasoning: string; check_type: "deterministic" | "llm" }>): Promise<void> {
  const records = checks.map(check => ({ verifier_run_id: verifierRunId, candidate_run_id: candidateRunId, check_name: check.check_name, check_type: check.check_type, status: check.status, reasoning: check.reasoning }));
  await supabase.from("ai_run_checks").insert(records);
}