import { corsHeaders } from './_shared/cors.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

interface ReplyRequest {
  clinician_id: string;
  user_id: string;
  incoming_text: string;
  user_goal?: string;
  thread_id?: string;
}

interface ClinicianContext {
  full_name: string;
  email: string;
  phone: string | null;
  communication_style: string;
  profile_notes: string | null;
  assignment_facility: string | null;
  assignment_end_date: string | null;
  days_remaining: number | null;
  recent_interactions: Array<{
    type: string;
    summary: string | null;
    date: string;
  }> | null;
  golden_notes: Array<{
    content: string;
    created_at: string;
  }> | null;
}

const STYLE_INSTRUCTIONS = {
  warm_friendly: "Be warm, empathetic, and conversational. Use friendly language and show genuine care. Include personal touches and warmth.",
  direct_brief: "Be concise and to the point. Use short sentences. No fluff. Get straight to business while remaining professional.",
  professional_formal: "Maintain a professional and formal tone. Use complete sentences, proper grammar, and respectful language throughout.",
  casual_relaxed: "Be casual and approachable. Use contractions, friendly language, and a relaxed tone. Keep it conversational but professional."
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured');
    }

    const { clinician_id, user_id, incoming_text, user_goal, thread_id }: ReplyRequest = await req.json();

    if (!clinician_id || !user_id || !incoming_text) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: clinician_id, user_id, incoming_text' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contextResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/get_clinician_reply_context`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          p_clinician_id: clinician_id,
          p_user_id: user_id
        })
      }
    );

    if (!contextResponse.ok) {
      const errorText = await contextResponse.text();
      throw new Error(`Failed to fetch clinician context: ${errorText}`);
    }

    const contextData = await contextResponse.json();
    const context: ClinicianContext = contextData[0] || {};

    const styleInstruction = STYLE_INSTRUCTIONS[context.communication_style as keyof typeof STYLE_INSTRUCTIONS] || STYLE_INSTRUCTIONS.professional_formal;

    const recentInteractionsText = context.recent_interactions?.length
      ? context.recent_interactions.map(i => `- ${i.type}: ${i.summary || 'No details'} (${new Date(i.date).toLocaleDateString()})`).join('\n')
      : 'No recent interactions';

    const goldenNotesText = context.golden_notes?.length
      ? context.golden_notes.map(n => `- ${n.content} (${new Date(n.created_at).toLocaleDateString()})`).join('\n')
      : 'No golden notes';

    const assignmentText = context.assignment_facility
      ? `Currently at ${context.assignment_facility}, assignment ends ${new Date(context.assignment_end_date || '').toLocaleDateString()} (${context.days_remaining} days remaining)`
      : 'No active assignment';

    const systemPrompt = `You are a professional communication assistant helping a healthcare recruiter respond to a clinician.

CLINICIAN PROFILE:
Name: ${context.full_name}
Email: ${context.email}
Phone: ${context.phone || 'Not provided'}
Current Assignment: ${assignmentText}

COMMUNICATION STYLE: ${context.communication_style}
${styleInstruction}

PROFILE NOTES:
${context.profile_notes || 'No notes'}

RECENT INTERACTIONS:
${recentInteractionsText}

IMPORTANT CONTEXT (Golden Notes):
${goldenNotesText}

USER'S GOAL FOR THIS REPLY:
${user_goal || 'General response'}

INSTRUCTIONS:
1. Generate TWO different response options
2. Both should address the clinician's message appropriately
3. Use the specified communication style
4. Consider the context and relationship history
5. Be professional but personalized
6. Keep responses appropriate for text messaging (not too long)
7. Each response should be 1-3 short paragraphs

Return your response in this exact JSON format:
{
  "reply_1": "First response option here",
  "reply_2": "Second response option here"
}`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `The clinician sent: "${incoming_text}"\n\nGenerate two response options.` }
        ],
        temperature: 0.8,
        response_format: { type: 'json_object' }
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const openaiData = await openaiResponse.json();
    const generatedContent = JSON.parse(openaiData.choices[0].message.content);

    const saveResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/reply_messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          thread_id: thread_id || null,
          user_id: user_id,
          clinician_id: clinician_id,
          message_type: 'ai_response',
          incoming_text: incoming_text,
          user_goal: user_goal || null,
          generated_reply_1: generatedContent.reply_1,
          generated_reply_2: generatedContent.reply_2,
          metadata: {
            model: 'gpt-4o-mini',
            style: context.communication_style,
            context_used: true
          }
        })
      }
    );

    if (!saveResponse.ok) {
      const errorText = await saveResponse.text();
      console.error('Failed to save message:', errorText);
    }

    const savedMessage = saveResponse.ok ? await saveResponse.json() : null;

    return new Response(
      JSON.stringify({
        success: true,
        message_id: savedMessage?.[0]?.id,
        reply_1: generatedContent.reply_1,
        reply_2: generatedContent.reply_2,
        context: {
          clinician_name: context.full_name,
          communication_style: context.communication_style,
          assignment: assignmentText
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in reply-generator:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        success: false
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});