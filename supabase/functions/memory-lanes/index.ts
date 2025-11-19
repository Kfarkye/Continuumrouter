import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

interface SparkRequest {
  operation: "capture";
  conversationId: string;
  messageId: number;
  userMessage: string;
  assistantResponse: string;
  spaceId?: string;
}

interface SurfaceRequest {
  operation: "retrieve";
  query: string;
  spaceId?: string;
  limit?: number;
}

interface StructureRequest {
  operation: "deduplicate";
  spaceId?: string;
}

interface StoreCodeChunksRequest {
  operation: "store_code_chunks";
  conversationId: string;
  filesToStore: Array<{ name: string; content: string }>;
}

interface RetrieveCodeChunksRequest {
  operation: "retrieve_code_chunks";
  query: string;
  conversationId: string;
  limit?: number;
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!text || text.trim().length < 5) {
    return null;
  }

  const truncatedText = text.length > 15000 ? text.substring(0, 15000) : text;

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: truncatedText.replace(/\n/g, ' '),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("OpenAI API Error Response:", errorBody);
    throw new Error(`OpenAI embeddings API error: ${response.status}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

function chunkCode(content: string, chunkSize = 50, overlap = 5): Array<{ text: string }> {
  const lines = content.split('\n');
  const chunks: Array<{ text: string }> = [];
  let step = chunkSize - overlap;
  if (step <= 0) step = 1;

  for (let i = 0; i < lines.length; i += step) {
    const chunkLines = lines.slice(i, i + chunkSize);
    const chunkText = chunkLines.join('\n');

    if (chunkText.trim().length > 50) {
      chunks.push({ text: chunkText });
    }

    if (i + chunkSize >= lines.length) {
      break;
    }
  }
  return chunks;
}

function getLanguageFromFileExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'rb': 'ruby',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'cs': 'csharp',
    'php': 'php',
    'go': 'go',
    'rs': 'rust',
    'kt': 'kotlin',
    'swift': 'swift',
    'html': 'html',
    'css': 'css',
    'sql': 'sql',
    'sh': 'bash',
  };
  return languageMap[ext] || 'plaintext';
}

interface CapturedMemory {
  content: string;
  kind: string;
  details?: any;
}

function extractMemoriesFromConversation(
  userMessage: string,
  assistantResponse: string
): CapturedMemory[] {
  const memories: CapturedMemory[] = [];

  const entityRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  const entities = new Set<string>();
  let match;
  while ((match = entityRegex.exec(userMessage + ' ' + assistantResponse)) !== null) {
    const entity = match[1];
    if (entity.length > 2 && !['The', 'This', 'That', 'These', 'Those'].includes(entity)) {
      entities.add(entity);
    }
  }

  entities.forEach((entity) => {
    memories.push({
      content: `Entity mentioned: ${entity}`,
      kind: 'fact',
      details: { entity },
    });
  });

  const preferencesRegex = /(?:I (?:prefer|like|want|need|use)|My (?:preference|choice) is)\s+([^.!?]+)/gi;
  while ((match = preferencesRegex.exec(userMessage)) !== null) {
    const preference = match[1].trim();
    if (preference.length > 5 && preference.length < 100) {
      memories.push({
        content: `User preference: ${preference}`,
        kind: 'preference',
        details: { preference },
      });
    }
  }

  const taskRegex = /(?:create|build|make|develop|implement|add|design|fix|update)\s+(?:a|an|the)?\s+([^.!?]{5,80})/gi;
  while ((match = taskRegex.exec(userMessage)) !== null) {
    const task = match[1].trim();
    if (task.length > 5) {
      memories.push({
        content: `Task mentioned: ${task}`,
        kind: 'task',
        details: { task },
      });
    }
  }

  const conceptRegex = /(?:is|are|means|refers to|defines?)\s+([^.!?]{10,80})/gi;
  while ((match = conceptRegex.exec(assistantResponse)) !== null) {
    const concept = match[1].trim();
    if (concept.length > 10) {
      memories.push({
        content: `Concept explained: ${concept}`,
        kind: 'context',
        details: { concept },
      });
    }
  }

  return memories;
}

async function sparkLane(
  sb: any,
  userId: string,
  request: SparkRequest
): Promise<{ captured: number; memories: any[] }> {
  const memories = extractMemoriesFromConversation(
    request.userMessage,
    request.assistantResponse
  );

  if (memories.length === 0) {
    return { captured: 0, memories: [] };
  }

  let spaceId = request.spaceId;
  if (!spaceId) {
    const { data: defaultSpace } = await sb
      .from("memory_spaces")
      .select("id")
      .eq("user_id", userId)
      .eq("name", "Default")
      .maybeSingle();

    spaceId = defaultSpace?.id;
  }

  if (!spaceId) {
    throw new Error("No memory space available");
  }

  const memoriesToInsert = [];
  for (const mem of memories) {
    const embedding = await generateEmbedding(mem.content);
    memoriesToInsert.push({
      space_id: spaceId,
      user_id: userId,
      content: mem.content,
      kind: mem.kind,
      embedding: JSON.stringify(embedding),
      source_conversation_id: request.conversationId,
      source_message_id: request.messageId.toString(),
      metadata: mem.details || {},
    });
  }

  const { data: inserted, error } = await sb
    .from("memories")
    .insert(memoriesToInsert)
    .select();

  if (error) {
    console.error("Error inserting memories:", error);
    throw new Error(`Failed to store memories: ${error.message}`);
  }

  return { captured: inserted?.length ?? 0, memories: inserted ?? [] };
}

async function surfaceLane(
  sb: any,
  userId: string,
  request: SurfaceRequest
): Promise<any[]> {
  const queryEmbedding = await generateEmbedding(request.query);

  if (!queryEmbedding) {
    console.warn("Query too short or embedding generation failed, returning empty results");
    return [];
  }

  let spaceId = request.spaceId;
  if (!spaceId) {
    const { data: defaultSpace } = await sb
      .from("memory_spaces")
      .select("id")
      .eq("user_id", userId)
      .eq("name", "Default")
      .maybeSingle();

    spaceId = defaultSpace?.id;
  }

  if (!spaceId) {
    return [];
  }

  const { data, error } = await sb.rpc("match_memories", {
    query_embedding: JSON.stringify(queryEmbedding),
    match_threshold: 0.7,
    match_count: request.limit ?? 5,
    filter_space_id: spaceId,
    filter_user_id: userId,
  });

  if (error) {
    throw new Error(`Failed to retrieve memories: ${error.message}`);
  }

  return data ?? [];
}

async function structureLane(
  sb: any,
  userId: string,
  request: StructureRequest
): Promise<{ deduplicated: number }> {
  let spaceId = request.spaceId;
  if (!spaceId) {
    const { data: defaultSpace } = await sb
      .from("memory_spaces")
      .select("id")
      .eq("user_id", userId)
      .eq("name", "Default")
      .maybeSingle();

    spaceId = defaultSpace?.id;
  }

  if (!spaceId) {
    return { deduplicated: 0 };
  }

  const { data: memories, error: fetchError } = await sb
    .from("memories")
    .select("id, content, embedding")
    .eq("space_id", spaceId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (fetchError || !memories || memories.length === 0) {
    return { deduplicated: 0 };
  }

  const seenEmbeddings = new Map<string, string>();
  const duplicateIds: string[] = [];

  for (const memory of memories) {
    const embeddingKey = memory.embedding;
    if (!embeddingKey) continue;

    if (seenEmbeddings.has(embeddingKey)) {
      duplicateIds.push(memory.id);
    } else {
      seenEmbeddings.set(embeddingKey, memory.id);
    }
  }

  if (duplicateIds.length === 0) {
    return { deduplicated: 0 };
  }

  const { error: deleteError } = await sb
    .from("memories")
    .delete()
    .in("id", duplicateIds);

  if (deleteError) {
    console.error("Error deleting duplicates:", deleteError);
    throw new Error(`Failed to deduplicate: ${deleteError.message}`);
  }

  return { deduplicated: duplicateIds.length };
}

async function storeCodeChunks(
  sb: any,
  userId: string,
  request: StoreCodeChunksRequest
): Promise<{ stored: number }> {
  const allChunks = [];

  for (const file of request.filesToStore) {
    const chunks = chunkCode(file.content);
    const language = getLanguageFromFileExtension(file.name);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await generateEmbedding(chunk.text);

      if (embedding) {
        allChunks.push({
          conversation_id: request.conversationId,
          user_id: userId,
          file_name: file.name,
          language: language,
          chunk_index: i,
          chunk_text: chunk.text,
          embedding: JSON.stringify(embedding),
        });
      }
    }
  }

  if (allChunks.length === 0) {
    return { stored: 0 };
  }

  const { data, error } = await sb
    .from("ai_code_chunks")
    .insert(allChunks)
    .select();

  if (error) {
    console.error("Error storing code chunks:", error);
    throw new Error(`Failed to store code chunks: ${error.message}`);
  }

  return { stored: data?.length ?? 0 };
}

async function retrieveCodeChunks(
  sb: any,
  userId: string,
  request: RetrieveCodeChunksRequest
): Promise<any[]> {
  const queryEmbedding = await generateEmbedding(request.query);

  if (!queryEmbedding) {
    return [];
  }

  const { data, error } = await sb.rpc("match_code_chunks", {
    query_embedding: JSON.stringify(queryEmbedding),
    filter_conversation_id: request.conversationId,
    filter_user_id: userId,
    match_threshold: 0.75,
    match_count: request.limit ?? 5,
  });

  if (error) {
    console.error("Error retrieving code chunks:", error);
    return [];
  }

  return data ?? [];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await sb.auth.getUser(token);

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const userId = user.id;
    const body = await req.json();

    let result: any;

    switch (body.operation) {
      case "capture":
        result = await sparkLane(sb, userId, body as SparkRequest);
        break;
      case "retrieve":
        result = await surfaceLane(sb, userId, body as SurfaceRequest);
        break;
      case "deduplicate":
        result = await structureLane(sb, userId, body as StructureRequest);
        break;
      case "store_code_chunks":
        result = await storeCodeChunks(sb, userId, body as StoreCodeChunksRequest);
        break;
      case "retrieve_code_chunks":
        result = await retrieveCodeChunks(sb, userId, body as RetrieveCodeChunksRequest);
        break;
      default:
        throw new Error(`Unknown operation: ${body.operation}`);
    }

    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("Memory lanes error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});