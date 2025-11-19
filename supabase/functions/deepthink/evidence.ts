import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { sha256, logInfo, logError } from "./util.ts";

const SEARCH_API_URL = Deno.env.get("SEARCH_API_URL") || "";
const SEARCH_API_KEY = Deno.env.get("SEARCH_API_KEY") || "";

export interface EvidenceSnippet {
  ref_id: string;
  source_uri: string;
  snippet_text: string;
  snippet_location: string;
  rerank_score: number;
}

export async function buildEvidence(supabase: SupabaseClient, spaceRunId: string, goal: string, keywords: string[]): Promise<EvidenceSnippet[]> {
  if (!SEARCH_API_URL || !SEARCH_API_KEY) {
    logInfo("buildEvidence", "Search API not configured, returning empty evidence");
    return [];
  }
  const snippets: EvidenceSnippet[] = [];
  const seenHashes = new Set<string>();
  try {
    const searchQuery = keywords.length > 0 ? keywords.join(" ") : goal;
    logInfo("buildEvidence", `Searching for: ${searchQuery}`);
    const searchResults = await performSearch(searchQuery);
    for (let i = 0; i < searchResults.length && i < 10; i++) {
      const result = searchResults[i];
      const snippet = extractSnippet(result);
      const hash = await sha256(snippet.snippet_text);
      if (seenHashes.has(hash)) continue;
      seenHashes.add(hash);
      const rerankScore = simpleRerank(goal, snippet.snippet_text);
      if (rerankScore < 0.3) continue;
      const evidence: EvidenceSnippet = { ref_id: `R${snippets.length + 1}`, source_uri: result.url, snippet_text: snippet.snippet_text, snippet_location: snippet.snippet_location, rerank_score: rerankScore };
      snippets.push(evidence);
      await supabase.from("ai_artifacts").insert({ space_run_id: spaceRunId, ref_id: evidence.ref_id, source_type: "search_result", source_uri: evidence.source_uri, snippet_hash: hash, snippet_text: evidence.snippet_text, snippet_location: evidence.snippet_location, rerank_score: rerankScore });
    }
    snippets.sort((a, b) => b.rerank_score - a.rerank_score);
    logInfo("buildEvidence", `Collected ${snippets.length} evidence snippets`);
    return snippets.slice(0, 5);
  } catch (error) {
    logError("buildEvidence", error);
    return [];
  }
}

async function performSearch(query: string): Promise<SearchResult[]> {
  try {
    const response = await fetch(`${SEARCH_API_URL}?q=${encodeURIComponent(query)}&count=10`, { headers: { "X-Subscription-Token": SEARCH_API_KEY, "Accept": "application/json" } });
    if (!response.ok) throw new Error(`Search API error: ${response.status}`);
    const data = await response.json();
    return (data.web?.results || []) as SearchResult[];
  } catch (error) {
    logError("performSearch", error);
    return [];
  }
}

interface SearchResult {
  title: string;
  url: string;
  description: string;
  snippet?: string;
}

function extractSnippet(result: SearchResult): { snippet_text: string; snippet_location: string } {
  const text = result.snippet || result.description || result.title;
  const maxLength = 500;
  return { snippet_text: text.slice(0, maxLength), snippet_location: result.title || "Untitled" };
}

function simpleRerank(goal: string, snippetText: string): number {
  const goalLower = goal.toLowerCase();
  const snippetLower = snippetText.toLowerCase();
  const goalWords = goalLower.split(/\s+/).filter(w => w.length > 3);
  if (goalWords.length === 0) return 0.5;
  let matchCount = 0;
  let positionBonus = 0;
  for (const word of goalWords) {
    if (snippetLower.includes(word)) {
      matchCount++;
      const position = snippetLower.indexOf(word);
      if (position < snippetLower.length * 0.3) positionBonus += 0.1;
    }
  }
  const matchRatio = matchCount / goalWords.length;
  const baseScore = matchRatio * 0.7 + positionBonus * 0.3;
  return Math.min(1.0, baseScore);
}

export function formatEvidenceForPrompt(snippets: EvidenceSnippet[]): string {
  if (snippets.length === 0) return "No external evidence available.";
  const formatted = snippets.map(s => `[${s.ref_id}] ${s.snippet_location}\n${s.snippet_text}\nSource: ${s.source_uri}\n`).join("\n");
  return `EVIDENCE GATHERED:\n\n${formatted}`;
}