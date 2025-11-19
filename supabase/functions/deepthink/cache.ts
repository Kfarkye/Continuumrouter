import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { sha256 } from "./util.ts";
import type { Usage } from "./util.ts";

export interface CachedResult<T = unknown> {
  output: T;
  usage: Usage;
}

export async function checkCache<T = unknown>(supabase: SupabaseClient, passType: string, inputData: unknown): Promise<CachedResult<T> | null> {
  const cacheKey = await sha256(JSON.stringify({ passType, inputData }));
  const { data, error } = await supabase.from("ai_cache").select("output_data, usage_metadata").eq("cache_key", cacheKey).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !data) return null;
  return { output: data.output_data as T, usage: data.usage_metadata as Usage };
}

export async function writeCache(supabase: SupabaseClient, passType: string, inputData: unknown, outputData: unknown, usage: Usage, ttlSeconds: number): Promise<void> {
  const cacheKey = await sha256(JSON.stringify({ passType, inputData }));
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await supabase.from("ai_cache").upsert({ cache_key: cacheKey, pass_type: passType, output_data: outputData, usage_metadata: usage, expires_at: expiresAt });
}