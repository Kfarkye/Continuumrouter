import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { callGeminiJSON } from "./provider.ts";
import { buildEvidence, formatEvidenceForPrompt } from "./evidence.ts";
import { deterministicChecks, verifierLLM, recordChecks } from "./verifier.ts";
import { recordCost, calculateCost, incrementTotals } from "./cost.ts";
import { validateJson } from "./validate.ts";
import { checkCache, writeCache } from "./cache.ts";
import { sleep, nowIso } from "./util.ts";
import { metrics, metricsResponse } from "./metrics.ts";
import planSchema from "./schemas/DeepThinkPlan.schema.json" with { type: "json" };
import draftSchema from "./schemas/DeepThinkDraft.schema.json" with { type: "json" };
import finalSchema from "./schemas/DeepThinkFinal.schema.json" with { type: "json" };

const laneConfig = {
  "name": "deepthink_lane_gemini_v2_5_fixed",
  "provider": "gemini",
  "schema_version": "2.5",
  "passes": {
    "planner": {
      "model": "gemini-2.5-flash",
      "cap_tokens": 6000,
      "timeout_ms": 10000,
      "params": { "temperature": 0.0 },
      "cache_ttl_seconds": 604800
    },
    "solver": {
      "model": "gemini-2.5-flash",
      "cap_tokens": 24000,
      "timeout_ms": 20000,
      "parallel": 3,
      "params_variants": [
        { "temperature": 0.3 },
        { "temperature": 0.5 },
        { "temperature": 0.7 }
      ]
    },
    "verifier": {
      "model": "gemini-2.5-pro",
      "cap_tokens": 12000,
      "timeout_ms": 15000,
      "params": { "temperature": 0.0 },
      "threshold": 0.8
    }
  },
  "retry_policy": {
    "solver": {
      "max_attempts": 2,
      "backoff_ms": [500],
      "retryable_errors": ["rate_limit", "transient_provider_error", "schema_mismatch"]
    }
  },
  "budget": {
    "max_tokens": 200000
  }
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method === "GET" && new URL(req.url).pathname === "/deepthink/metrics") {
    return metricsResponse("v2.5");
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization")!;
  const token = authHeader.replace("Bearer ", "");
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const userId = user.id;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { goal, space_run_id } = await req.json();
  if (!goal || !space_run_id) {
    return new Response(JSON.stringify({ error: "missing_required_fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        try {
          controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch (e) {
          console.error("SSE emit error:", e);
        }
      };
      const close = () => {
        try {
          controller.close();
        } catch (e) {
          console.error("SSE close error:", e);
        }
      };
      const traceId = crypto.randomUUID();
      const t0 = Date.now();
      let verifyScore = 0;
      let winnerEmitted = false;
      metrics.runsTotal.inc(1, {});
      try {
        emit("progress", { stage: "planning", message: "Analyzing goal and creating strategic plan..." });
        const cachedPlan = await checkCache(supabase, "planner", { goal });
        let plan: { goal_restatement: string; approach: string; key_considerations: string[]; estimated_steps: number; requires_evidence: boolean; evidence_keywords?: string[] };
        let planUsage: { input_tokens: number; output_tokens: number };
        if (cachedPlan) {
          plan = cachedPlan.output as typeof plan;
          planUsage = cachedPlan.usage;
          metrics.cacheHitsTotal.inc(1, { pass: "planner" });
        } else {
          const systemPrompt = `You are a strategic planning AI for DeepThink v2.5. Your job is to analyze the user's goal and create a detailed plan for solving it.\n\nReturn a JSON object with:\n- goal_restatement: Clear restatement of what the user wants\n- approach: High-level strategy for solving this\n- key_considerations: Array of important factors to consider\n- estimated_steps: Estimated number of reasoning steps needed (1-20)\n- requires_evidence: Whether external evidence would help\n- evidence_keywords: If requires_evidence is true, provide search keywords`;
          const userPrompt = `GOAL:\n${goal}\n\nCreate a strategic plan for solving this goal.`;
          const planResult = await callGeminiJSON({ model: laneConfig.passes.planner.model, systemPrompt, userPrompt, responseSchema: planSchema, temperature: laneConfig.passes.planner.params.temperature, timeoutMs: laneConfig.passes.planner.timeout_ms });
          plan = planResult.data as typeof plan;
          planUsage = planResult.usage;
          validateJson(plan, planSchema, "plan");
          await writeCache(supabase, "planner", { goal }, plan, planUsage, laneConfig.passes.planner.cache_ttl_seconds);
        }
        const { data: planRun } = await supabase.from("ai_runs").insert({ space_run_id, pass_type: "planner", model_name: laneConfig.passes.planner.model, input_data: { goal }, output_data: plan, latency_ms: 0, input_tokens: planUsage.input_tokens, output_tokens: planUsage.output_tokens }).select("id").single();
        await recordCost(supabase, planRun!.id, userId, laneConfig.passes.planner.model, planUsage);
        const totalTokens = planUsage.input_tokens + planUsage.output_tokens;
        const costUsd = calculateCost(planUsage);
        await incrementTotals(supabase, space_run_id, totalTokens, costUsd);
        emit("plan", plan);
        emit("progress", { stage: "evidence", message: "Gathering evidence and context..." });
        const evidence = plan.requires_evidence ? await buildEvidence(supabase, space_run_id, goal, plan.evidence_keywords || []) : [];
        emit("evidence", { count: evidence.length, snippets: evidence });
        emit("progress", { stage: "solving", message: `Generating ${laneConfig.passes.solver.parallel} solution candidates...` });
        const evidenceContext = formatEvidenceForPrompt(evidence);
        const solverSystemPrompt = `You are a solution generation AI for DeepThink v2.5. Your job is to solve the user's goal using structured reasoning.

Provide your solution as a JSON object with:
- reasoning_steps: Array of sequential reasoning steps (each with step_number, description, conclusion, and optional evidence_refs)
- synthesis: Your final answer. Use inline citations like [R1], [R2] if referencing evidence.
- confidence: Your confidence level (0.0 to 1.0)
- citations_used: Array of evidence references you cited (e.g., ['R1', 'R2']).
- assumptions: Key assumptions made
- limitations: Known limitations of your solution

CRITICAL VALIDATION RULE: The 'citations_used' array MUST EXACTLY match the unique citations found in your 'synthesis'. A mismatch will cause rejection.

Steps to ensure citation accuracy:
1. Write your 'synthesis', incorporating evidence with [R#] tags.
2. Review the 'synthesis' and extract all unique [R#] tags used.
3. Populate the 'citations_used' array with this exact list, sorted (e.g., ['R1', 'R3']).
4. Double-check that the array and the synthesis match perfectly before outputting the JSON.

IMPORTANT: If no evidence is provided, 'citations_used' MUST be empty [] and DO NOT use [R1] style citations in 'synthesis'.`;
        const solverUserPrompt = `GOAL:\n${goal}\n\nPLAN:\n${JSON.stringify(plan, null, 2)}\n\n${evidenceContext}\n\nProvide a comprehensive solution following the structured format.`;
        const controllers: AbortController[] = [];
        let verifying = false;
        const solverTasks = laneConfig.passes.solver.params_variants.map(async (variant, idx) => {
          for (let attempt = 1; attempt <= (laneConfig.retry_policy?.solver?.max_attempts || 1); attempt++) {
            if (winnerEmitted) return { k: idx, passed: true };
            const controller = new AbortController();
            controllers.push(controller);
            try {
              const draftResult = await callGeminiJSON({ model: laneConfig.passes.solver.model, systemPrompt: solverSystemPrompt, userPrompt: solverUserPrompt, responseSchema: draftSchema, temperature: variant.temperature, timeoutMs: laneConfig.passes.solver.timeout_ms });
              if (winnerEmitted) return { k: idx, passed: true };
              const draft = draftResult.data as { reasoning_steps: Array<{ step_number: number; description: string; conclusion: string; evidence_refs?: string[] }>; synthesis: string; confidence: number; citations_used: string[]; assumptions?: string[]; limitations?: string[] };
              validateJson(draft, draftSchema, "draft");
              const { data: candidateRun } = await supabase.from("ai_runs").insert({ space_run_id, pass_type: "solver", model_name: laneConfig.passes.solver.model, input_data: { goal, plan, evidence, variant }, output_data: draft, latency_ms: draftResult.latency_ms, input_tokens: draftResult.usage.input_tokens, output_tokens: draftResult.usage.output_tokens }).select("id").single();
              const candidateRunId = candidateRun!.id;
              await recordCost(supabase, candidateRunId, userId, laneConfig.passes.solver.model, draftResult.usage);
              const totalTokens = draftResult.usage.input_tokens + draftResult.usage.output_tokens;
              const costUsd = calculateCost(draftResult.usage);
              await incrementTotals(supabase, space_run_id, totalTokens, costUsd);
              emit("candidate", { candidate: idx, confidence: draft.confidence, steps: draft.reasoning_steps.length });
              const detChecks = deterministicChecks(goal, draft);
              const failedDetCheck = detChecks.find((c) => c.status === "fail");
              if (failedDetCheck) {
                emit("candidate_rejected", { candidate: idx, reason: "deterministic_check_failed", check: failedDetCheck.check_name });
                await recordChecks(supabase, candidateRunId, candidateRunId, detChecks.map((c) => ({ ...c, check_type: "deterministic" as const })));
                throw new Error(`deterministic_check_failed:${failedDetCheck.check_name}`);
              }
              while (verifying) await sleep(20);
              verifying = true;
              try {
                emit("progress", { stage: "verifying", message: `Verifying candidate ${idx + 1}...` });
                const llm = await verifierLLM(goal, draft, laneConfig.passes.verifier.model, laneConfig.passes.verifier.threshold);
                const { data: verifierRun } = await supabase.from("ai_runs").insert({ space_run_id, pass_type: "verifier_llm", model_name: laneConfig.passes.verifier.model, input_data: { goal, draft }, output_data: llm, latency_ms: llm.latency_ms, input_tokens: llm.usage.input_tokens, output_tokens: llm.usage.output_tokens }).select("id").single();
                await recordCost(supabase, verifierRun!.id, userId, laneConfig.passes.verifier.model, llm.usage);
                const totalTokens = llm.usage.input_tokens + llm.usage.output_tokens;
                const costUsd = calculateCost(llm.usage);
                await incrementTotals(supabase, space_run_id, totalTokens, costUsd);
                await recordChecks(supabase, verifierRun!.id, candidateRunId, [...detChecks.map((c) => ({ ...c, check_type: "deterministic" as const })), ...llm.checks.map((c) => ({ ...c, check_type: "llm" as const }))]);
                if (!winnerEmitted && llm.verdict === "pass") {
                  winnerEmitted = true;
                  verifyScore = llm.score;
                  for (const c of controllers) { try { c.abort(); } catch {} }
                  metrics.earlyExitTotal.inc(1, {});
                  const final = { final: draft.synthesis, citations: extractCitations(draft.synthesis), residual_risk: llm.residual_risk, verify_score: verifyScore };
                  validateJson(final, finalSchema, "final");
                  await supabase.from("ai_runs").update({ is_winner: true }).eq("id", candidateRunId);
                  await supabase.from("space_runs").update({ verify_score: verifyScore, residual_risk: llm.residual_risk, status: "success", final_output: final }).eq("id", space_run_id);
                  emit("final", final);
                  return { k: idx, passed: true };
                } else {
                  emit("candidate_rejected", { candidate: idx, reason: "failed_verification", score: llm.score, verdict: llm.verdict });
                  metrics.passFailuresTotal.inc(1, { pass: "verifier", candidate: String(idx) });
                }
              } finally {
                verifying = false;
              }
              return { k: idx, passed: false };
            } catch (e) {
              const errMsg = String(e);
              if (attempt < (laneConfig.retry_policy?.solver?.max_attempts || 1) && laneConfig.retry_policy?.solver?.retryable_errors?.some((re) => errMsg.includes(re))) {
                const backoffMs = laneConfig.retry_policy.solver.backoff_ms[attempt - 1] ?? 1000;
                await sleep(backoffMs);
                continue;
              }
              metrics.passFailuresTotal.inc(1, { pass: "solver", candidate: String(idx) });
              return { k: idx, passed: false };
            }
          }
          return { k: idx, passed: false };
        });
        await Promise.allSettled(solverTasks);
        if (!winnerEmitted) {
          const { data: currentStatus } = await supabase.from("space_runs").select("status").eq("id", space_run_id).single();
          if (currentStatus?.status !== "error") {
            await supabase.from("space_runs").update({ status: "error", residual_risk: "verifier_fail_all", verify_score: 0 }).eq("id", space_run_id);
            emit("error", { reason: "all_candidates_failed_verification" });
          }
        }
      } catch (e) {
        console.error(`DeepThink 2.5 failure trace=${traceId}`, e);
        metrics.passFailuresTotal.inc(1, { pass: "orchestrator", reason: "exception" });
        const msg = String(e);
        const errType = msg.includes("token_cap_breach") ? "budget_breach" : "system_failure";
        await supabase.from("space_runs").update({ status: "error", residual_risk: errType }).eq("id", space_run_id).neq("status", "error");
        emit("error", { message: "execution_error", trace_id: traceId, detail: msg.slice(0, 200) });
      } finally {
        const elapsed = Date.now() - t0;
        metrics.p95LatencyMs.observe(elapsed, {});
        if (verifyScore > 0) metrics.verifyScoreGauge.set(verifyScore);
        await supabase.from("space_runs").update({ end_time: nowIso(), total_latency_ms: elapsed }).eq("id", space_run_id);
        emit("done", { elapsed_ms: elapsed, trace_id: traceId });
        close();
      }
    }
  });
  return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } });
});

function extractCitations(text: string): string[] {
  const set = new Set<string>();
  const re = /\[R(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) { set.add(`R${m[1]}`); }
  return [...set].sort();
}
