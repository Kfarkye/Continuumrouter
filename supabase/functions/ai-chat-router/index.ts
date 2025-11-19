import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from './_shared/cors.ts';
import { handleSearchQuery } from './searchRouter.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string }; source?: any }>;
}

interface RouterRequest {
  messages?: ChatMessage[];
  sessionId?: string;
  userMessage?: string;
  attachedFiles?: string[];
  imageIds?: string[];
  providerHint?: string;
  memories?: any[];
  provider?: string;
  model?: string;
  conversationId?: string;
  userId?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  images?: Array<{ id: string; signed_url: string; mime_type: string }>;
  spaceId?: string;
  mode?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body: RouterRequest = await req.json();

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');
    let extractedUserId: string | undefined;

    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      extractedUserId = user?.id;
    }

    let messages: ChatMessage[] = [];
    let conversationId: string | undefined;
    let userId: string | undefined;
    let spaceId: string | undefined;
    let imageIdsToFetch: string[] = [];

    if (body.sessionId && body.userMessage) {
      console.log('🔄 Converting old format');

      const { data: conversation } = await supabase
        .from('ai_conversations')
        .select('id, space_id')
        .eq('session_id', body.sessionId)
        .maybeSingle();

      if (conversation) {
        conversationId = conversation.id;
        spaceId = conversation.space_id || undefined;

        const { data: history } = await supabase
          .from('ai_messages')
          .select('role, content')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })
          .limit(20);

        if (history) {
          messages = history.map(h => ({
            role: h.role as 'user' | 'assistant' | 'system',
            content: h.content
          }));
        }
      } else if (extractedUserId) {
        const { data: newConv } = await supabase
          .from('ai_conversations')
          .insert({
            session_id: body.sessionId,
            user_id: extractedUserId,
            space_id: body.spaceId || null,
            mode: body.mode || 'chat'
          })
          .select('id, space_id')
          .single();

        if (newConv) {
          conversationId = newConv.id;
          spaceId = newConv.space_id || undefined;
        }
      }

      messages.push({role: 'user', content: body.userMessage});
      userId = extractedUserId;
      imageIdsToFetch = body.imageIds || [];
    } else {
      messages = body.messages || [];
      conversationId = body.conversationId;
      userId = body.userId || extractedUserId;
      spaceId = body.spaceId;
    }

    const {
      provider = body.providerHint || 'anthropic',
      model = 'claude-3-5-sonnet-20241022',
      temperature = 0.7,
      maxTokens = 4096,
      systemPrompt,
      images = [],
      mode = 'chat'
    } = body;

    if (!messages || messages.length === 0) {
      throw new Error('Messages array is required');
    }

    let fetchedImages: Array<{ id: string; signed_url: string; mime_type: string }> = [];
    if (imageIdsToFetch.length > 0 && userId) {
      const { data: imageData } = await supabase
        .from('uploaded_images')
        .select('id, signed_url, mime_type')
        .in('id', imageIdsToFetch)
        .eq('user_id', userId);

      if (imageData) {
        fetchedImages = imageData;
      }
    }

    const allImages = [...images, ...fetchedImages];

    if (allImages.length > 0 && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'user' && typeof lastMsg.content === 'string') {
        const textContent = lastMsg.content;
        const multiPartContent: any[] = [{type: 'text', text: textContent}];

        for (const img of allImages) {
          multiPartContent.push({type: 'image_url', image_url: {url: img.signed_url}});
        }

        messages[messages.length - 1] = {role: 'user', content: multiPartContent};
      }
    }

    console.log('🚀 Router:', {provider, model, msgCount: messages.length, imgCount: allImages.length});

    const userMessage = messages[messages.length - 1]?.content;
    const shouldSearch = typeof userMessage === 'string' && await shouldTriggerSearch(userMessage);

    if (shouldSearch) {
      return await handleSearchQuery({query: userMessage as string, conversationId, userId, messages, supabase, corsHeaders});
    }

    let memoryContext = '';
    if (conversationId && userId && typeof userMessage === 'string') {
      try {
        const embedding = await generateEmbedding(userMessage);
        const {data: memories} = await supabase.rpc('match_memories', {
          query_embedding: embedding, match_threshold: 0.7, match_count: 5,
          filter_user_id: userId, filter_space_id: spaceId
        });

        if (memories && memories.length > 0) {
          memoryContext = '\n\nContext:\n' + memories.map((m: any) => `- ${m.content}`).join('\n');
        }
      } catch (memError) {
        console.warn('Memory failed:', memError);
      }
    }

    const finalSystemPrompt = (systemPrompt || '') + memoryContext;

    let response;
    if (provider === 'anthropic') {
      response = await callAnthropic(messages, model, finalSystemPrompt, temperature, maxTokens, allImages);
    } else if (provider === 'openai') {
      response = await callOpenAI(messages, model, finalSystemPrompt, temperature, maxTokens, allImages);
    } else if (provider === 'google') {
      response = await callGemini(messages, model, finalSystemPrompt, temperature, maxTokens, allImages);
    } else {
      throw new Error(`Unsupported: ${provider}`);
    }

    if (conversationId) {
      await supabase.from('ai_messages').insert({
        conversation_id: conversationId, role: 'assistant',
        content: response.content, model: model, provider: provider
      });
    }

    return new Response(JSON.stringify(response), {
      headers: {...corsHeaders, 'Content-Type': 'application/json'}
    });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({error: error.message, details: error.stack}), {
      status: 500, headers: {...corsHeaders, 'Content-Type': 'application/json'}
    });
  }
});

async function shouldTriggerSearch(query: string): Promise<boolean> {
  const k = ['latest', 'recent', 'current', 'today', 'now', 'news', 'update', 'search', 'find', 'price', 'stock'];
  return k.some(kw => query.toLowerCase().includes(kw));
}

async function generateEmbedding(text: string): Promise<number[]> {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({model: 'text-embedding-3-small', input: text})
  });
  const d = await r.json();
  return d.data[0].embedding;
}

async function callAnthropic(messages: ChatMessage[], model: string, systemPrompt: string, temperature: number, maxTokens: number, images: any[]): Promise<{content: string; usage: any}> {
  const anthropicMessages = await Promise.all(messages.map(async msg => {
    if (typeof msg.content === 'string') return {role: msg.role, content: msg.content};

    const content: any[] = [];
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text' && part.text) {
          content.push({type: 'text', text: part.text});
        } else if (part.type === 'image_url' && part.image_url?.url) {
          const imageUrl = part.image_url.url;

          if (imageUrl.startsWith('data:image')) {
            const base64Data = imageUrl.split(',')[1];
            const mediaType = imageUrl.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
            content.push({type: 'image', source: {type: 'base64', media_type: mediaType, data: base64Data}});
          } else {
            try {
              const imgResponse = await fetch(imageUrl);
              const arrayBuffer = await imgResponse.arrayBuffer();
              const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
              content.push({type: 'image', source: {type: 'base64', media_type: 'image/jpeg', data: base64}});
            } catch (err) {
              console.error('Image fetch failed:', err);
            }
          }
        }
      }
    }
    return {role: msg.role, content};
  }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
    body: JSON.stringify({model, messages: anthropicMessages, system: systemPrompt, temperature, max_tokens: maxTokens})
  });

  if (!response.ok) throw new Error(`Anthropic error: ${await response.text()}`);
  const data = await response.json();
  return {content: data.content[0].text, usage: data.usage};
}

async function callOpenAI(messages: ChatMessage[], model: string, systemPrompt: string, temperature: number, maxTokens: number, images: any[]): Promise<{content: string; usage: any}> {
  const openaiMessages: any[] = [];
  if (systemPrompt) openaiMessages.push({role: 'system', content: systemPrompt});
  messages.forEach(msg => openaiMessages.push({role: msg.role, content: msg.content}));

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({model, messages: openaiMessages, temperature, max_tokens: maxTokens})
  });

  if (!response.ok) throw new Error(`OpenAI error: ${await response.text()}`);
  const data = await response.json();
  return {content: data.choices[0].message.content, usage: data.usage};
}

async function callGemini(messages: ChatMessage[], model: string, systemPrompt: string, temperature: number, maxTokens: number, images: any[]): Promise<{content: string; usage: any}> {
  const geminiMessages: any[] = [];
  messages.forEach(msg => {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    if (typeof msg.content === 'string') {
      geminiMessages.push({role, parts: [{text: msg.content}]});
    } else if (Array.isArray(msg.content)) {
      const parts: any[] = [];
      msg.content.forEach(part => {
        if (part.type === 'text' && part.text) parts.push({text: part.text});
        else if (part.type === 'image_url' && part.image_url?.url) {
          const b64 = part.image_url.url.includes('base64,') ? part.image_url.url.split(',')[1] : part.image_url.url;
          parts.push({inline_data: {mime_type: 'image/jpeg', data: b64}});
        }
      });
      geminiMessages.push({role, parts});
    }
  });

  const body: any = {contents: geminiMessages, generationConfig: {temperature, maxOutputTokens: maxTokens}};
  if (systemPrompt) body.systemInstruction = {parts: [{text: systemPrompt}]};

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${Deno.env.get('GEMINI_API_KEY')}`, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)
  });

  if (!response.ok) throw new Error(`Gemini error: ${await response.text()}`);
  const data = await response.json();
  return {content: data.candidates[0].content.parts[0].text, usage: data.usageMetadata};
}
