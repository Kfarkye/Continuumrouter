import type { Usage } from "./util.ts";
import { logError, logInfo } from "./util.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_API_BASE = Deno.env.get("GEMINI_API_BASE") || "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiCallOptions {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  responseSchema: Record<string, unknown>;
  temperature?: number;
  timeoutMs?: number;
}

export interface GeminiResponse<T = unknown> {
  data: T;
  usage: Usage;
  latency_ms: number;
}

function cleanSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "$schema" || key === "title" || key === "description" && typeof value === "string" && schema.type === "object") {
      continue;
    }
    if (key === "additionalProperties") {
      continue;
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      cleaned[key] = cleanSchema(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      cleaned[key] = value.map(item =>
        typeof item === "object" && item !== null && !Array.isArray(item)
          ? cleanSchema(item as Record<string, unknown>)
          : item
      );
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export async function callGeminiJSON<T = unknown>(options: GeminiCallOptions): Promise<GeminiResponse<T>> {
  const { model, systemPrompt, userPrompt, responseSchema, temperature = 0.0, timeoutMs = 30000 } = options;
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${GEMINI_API_KEY}`;
    const cleanedSchema = cleanSchema(responseSchema);
    const payload = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature, responseMimeType: "application/json", responseSchema: cleanedSchema }
    };
    logInfo("GeminiCall", `Calling ${model}`, { promptLength: userPrompt.length });
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errorText}`);
    }
    const result = await response.json();
    if (!result.candidates?.[0]?.content?.parts?.[0]?.text) throw new Error("Gemini response missing expected content structure");
    const textResponse = result.candidates[0].content.parts[0].text;
    const parsedData = JSON.parse(textResponse) as T;
    const usage: Usage = { input_tokens: result.usageMetadata?.promptTokenCount || 0, output_tokens: result.usageMetadata?.candidatesTokenCount || 0 };
    const latency_ms = Date.now() - startTime;
    logInfo("GeminiCall", `Success in ${latency_ms}ms`, { tokens: usage.input_tokens + usage.output_tokens });
    return { data: parsedData, usage, latency_ms };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") throw new Error(`Gemini call timeout after ${timeoutMs}ms`);
    logError("GeminiCall", error);
    throw error;
  }
}