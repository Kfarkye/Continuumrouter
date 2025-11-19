import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const EXERCISE_SYSTEM_PROMPTS: Record<string, string> = {
  find_bug: `You are an expert programming instructor creating debugging exercises.

## Task:
Given working code, create a debugging challenge by introducing a realistic bug that AI assistants commonly generate.

## Instructions:
1. Introduce ONE clear bug that:
   - Is realistic and commonly seen in AI-generated code
   - Has an obvious fix once identified
   - Relates to the skill focus provided
2. Create 3-5 test cases that will fail with the bug
3. Generate 3 progressive hints (easy → medium → hard)
4. Write a clear explanation of the bug and fix

## Output Format (JSON):
{
  "title": "Debug: Array Index Error",
  "instructions": "This function should... but has a bug. Find and fix it.",
  "starter_code": "// buggy code here",
  "solution_code": "// fixed code here",
  "test_cases": [
    {"id": "1", "input": [1,2,3], "expected_output": 6, "description": "Sum of array"}
  ],
  "hints": [
    {"id": "1", "level": 1, "text": "Check array boundaries"},
    {"id": "2", "level": 2, "text": "Look at the loop condition"},
    {"id": "3", "level": 3, "text": "The loop goes one index too far"}
  ]
}`,

  write_prompt: `You are an expert AI prompt engineering instructor.

## Task:
Create a prompt writing exercise focused on the specified skill area.

## Instructions:
1. Define a clear task that requires a well-structured prompt
2. Provide 2-3 example prompts (bad, good, excellent)
3. List specific criteria for evaluation
4. Include expected characteristics of a good prompt

## Output Format (JSON):
{
  "title": "Write a Prompt for React Component",
  "instructions": "Write a prompt to generate a React component that...",
  "rubric": [
    {"name": "Clarity", "description": "Clear, specific requirements", "maxScore": 4},
    {"name": "Context", "description": "Provides usage context", "maxScore": 4}
  ],
  "examples": [
    {
      "id": "1",
      "label": "Vague Prompt",
      "prompt": "Make a button",
      "quality": "bad",
      "issues": ["No specifications", "No context"]
    },
    {
      "id": "2",
      "label": "Better Prompt",
      "prompt": "Create a React button component with...",
      "quality": "good",
      "strengths": ["Specific requirements", "Technology mentioned"]
    }
  ]
}`,

  identify_pattern: `You are an expert React instructor creating pattern recognition exercises.

## Task:
Create a code example that demonstrates a specific React pattern.

## Instructions:
1. Write clear, exemplary code for the specified pattern
2. Ensure the pattern is obvious but not trivial
3. Add explanation of why this pattern is useful
4. Include common mistakes (anti-patterns)
5. Suggest alternative approaches

## Output Format (JSON):
{
  "code": "// React code here",
  "language": "tsx",
  "correctPattern": "Custom Hook",
  "explanation": "This code uses a custom hook to...",
  "antiPattern": "Don't fetch data directly in components",
  "alternatives": ["useQuery from React Query", "SWR hook"]
}`,
};

interface ExerciseRequest {
  tutorial_id: string;
  exercise_type: 'find_bug' | 'write_prompt' | 'identify_pattern';
  code: string;
  language: string;
  skill_focus: string[];
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

    const { tutorial_id, exercise_type, code, language, skill_focus }: ExerciseRequest = await req.json();

    if (!tutorial_id || !exercise_type) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: tutorial_id, exercise_type' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`[Exercise Generator] Creating ${exercise_type} exercise for tutorial ${tutorial_id}`);

    const systemPrompt = EXERCISE_SYSTEM_PROMPTS[exercise_type];
    if (!systemPrompt) {
      throw new Error(`Unknown exercise type: ${exercise_type}`);
    }

    const contextPrompt = code
      ? `${systemPrompt}\n\n## Base Code (${language}):\n\`\`\`${language}\n${code}\n\`\`\`\n\n## Skill Focus:\n${skill_focus.join(', ')}`
      : `${systemPrompt}\n\n## Skill Focus:\n${skill_focus.join(', ')}\n\nCreate an appropriate exercise for these skills.`;

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
                  text: contextPrompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('[Exercise Generator] Gemini API error:', errorText);
      throw new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    const geminiData: GeminiResponse = await geminiResponse.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      throw new Error('No response from Gemini');
    }

    console.log('[Exercise Generator] Received response from Gemini');

    let parsedResponse: any;
    try {
      parsedResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[Exercise Generator] Failed to parse JSON:', responseText);
      throw new Error('Invalid JSON response from AI');
    }

    const supabase = (await import('jsr:@supabase/supabase-js@2')).createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    );

    if (exercise_type === 'find_bug' || exercise_type === 'identify_pattern') {
      const exerciseData = {
        tutorial_id,
        exercise_type,
        title: parsedResponse.title || 'Exercise',
        instructions: parsedResponse.instructions || '',
        starter_code: parsedResponse.starter_code || code || '',
        solution_code: parsedResponse.solution_code || code || '',
        test_cases: JSON.stringify(parsedResponse.test_cases || []),
        hints: JSON.stringify(parsedResponse.hints || []),
        max_attempts: 3,
        sort_order: 0,
      };

      const { data, error: insertError } = await supabase
        .from('tutorial_exercises')
        .insert(exerciseData)
        .select()
        .single();

      if (insertError) {
        console.error('[Exercise Generator] Database insert error:', insertError);
        throw new Error(`Failed to save exercise: ${insertError.message}`);
      }

      console.log(`[Exercise Generator] Successfully created exercise ${data.id}`);

      return new Response(
        JSON.stringify({
          success: true,
          exercise_id: data.id,
          exercise: parsedResponse,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: true,
          exercise: parsedResponse,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('[Exercise Generator] Error:', error);

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
