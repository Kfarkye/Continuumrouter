import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const TUTORIAL_SYSTEM_PROMPT = `You are an expert programming tutor. Your task is to analyze code and create a step-by-step tutorial that explains it clearly and pedagogically.

## Instructions:
1. Break down the code into logical teaching segments (steps)
2. For each step, provide:
   - A clear, educational explanation in Markdown format
   - Specific line numbers to highlight that correspond to what you're explaining
3. Start with high-level concepts, then drill into details
4. Use progressive disclosure - don't overwhelm with everything at once
5. Identify key concepts, patterns, and best practices
6. Keep explanations concise but thorough

## Output Format:
Respond with a JSON object in this exact format:
{
  "steps": [
    {
      "step_number": 1,
      "explanation": "## Step 1: Understanding the Function Declaration\\n\\nThis function demonstrates...",
      "highlight_lines": "1-3,5"
    },
    {
      "step_number": 2,
      "explanation": "## Step 2: Processing the Data\\n\\nHere we iterate through...",
      "highlight_lines": "7-12"
    }
  ]
}

## Important:
- highlight_lines should be a string with comma-separated line numbers or ranges (e.g., "1-5,8,10-15")
- Explanations should use Markdown formatting
- Aim for 4-8 steps depending on code complexity
- Ensure line numbers are valid for the provided code`;

interface TutorialRequest {
  tutorial_id: string;
  code: string;
  language: string;
}

interface TutorialStep {
  step_number: number;
  explanation: string;
  highlight_lines: string;
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase configuration missing');
    }

    const { tutorial_id, code, language }: TutorialRequest = await req.json();

    if (!tutorial_id || !code) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: tutorial_id, code' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`[Tutorial Generator] Processing tutorial ${tutorial_id} for ${language}`);

    // Call Gemini API
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${TUTORIAL_SYSTEM_PROMPT}\n\n## Code to Explain (${language}):\n\`\`\`${language}\n${code}\n\`\`\``,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('[Tutorial Generator] Gemini API error:', errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData: GeminiResponse = await geminiResponse.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      throw new Error('No response from Gemini');
    }

    console.log('[Tutorial Generator] Received response from Gemini');

    // Parse the JSON response from Gemini
    let parsedResponse: { steps: TutorialStep[] };
    try {
      parsedResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[Tutorial Generator] Failed to parse JSON:', responseText);
      throw new Error('Invalid JSON response from AI');
    }

    if (!parsedResponse.steps || !Array.isArray(parsedResponse.steps)) {
      throw new Error('Invalid response format: missing steps array');
    }

    // Insert tutorial steps into database using service role
    const supabase = (await import('jsr:@supabase/supabase-js@2')).createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    );

    const stepsToInsert = parsedResponse.steps.map(step => ({
      tutorial_id,
      step_number: step.step_number,
      explanation: step.explanation,
      highlight_spec: step.highlight_lines || null,
      is_completed: false,
    }));

    const { error: insertError } = await supabase
      .from('tutorial_steps')
      .insert(stepsToInsert);

    if (insertError) {
      console.error('[Tutorial Generator] Database insert error:', insertError);
      throw new Error(`Failed to save tutorial steps: ${insertError.message}`);
    }

    console.log(`[Tutorial Generator] Successfully created ${stepsToInsert.length} steps`);

    return new Response(
      JSON.stringify({
        success: true,
        tutorial_id,
        steps: parsedResponse.steps,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[Tutorial Generator] Error:', error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
