import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { Usage } from "./util.ts";
import { logError } from "./util.ts";

const GEMINI_RATE_IN = Number(Deno.env.get("GEMINI_RATE_IN_USD_PER_MTOK") || "0");
const GEMINI_RATE_OUT = Number(Deno.env.get("GEMINI_RATE_OUT_USD_PER_MTOK") || "0");

export function calculateCost(usage: Usage, provider = "gemini"): number {
  if (provider !== "gemini") return 0;
  const inputCost = (usage.input_tokens / 1_000_000) * GEMINI_RATE_IN;
  const outputCost = (usage.output_tokens / 1_000_000) * GEMINI_RATE_OUT;
  return inputCost + outputCost;
}

export async function recordCost(supabase: SupabaseClient, aiRunId: string, userId: string, model: string, usage: Usage, provider = "gemini"): Promise<void> {
  const cost = calculateCost(usage, provider);
  try {
    const { error } = await supabase.from("ai_cost_ledger").insert({ ai_run_id: aiRunId, user_id: userId, provider, model, input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cost_usd: cost });
    if (error) logError("recordCost", error);
  } catch (error) {
    logError("recordCost", error);
  }
}

export async function incrementTotals(supabase: SupabaseClient, spaceRunId: string, tokens: number, costUsd: number): Promise<void> {
  try {
    const { error } = await supabase.rpc("increment_space_run_totals", { p_space_run_id: spaceRunId, p_tokens: tokens, p_cost_usd: costUsd });
    if (error) logError("incrementTotals", error);
  } catch (error) {
    logError("incrementTotals", error);
  }
}