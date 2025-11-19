import { useState, useCallback } from 'react';
import { getSupabase } from '../lib/supabaseClient';

export interface DeepThinkPhase {
  stage: 'planning' | 'evidence' | 'solving' | 'verifying' | 'complete' | 'error';
  message: string;
}

export interface DeepThinkPlan {
  goal_restatement: string;
  approach: string;
  key_considerations: string[];
  estimated_steps: number;
  requires_evidence: boolean;
  evidence_keywords?: string[];
}

export interface DeepThinkEvidence {
  count: number;
  snippets: Array<{
    ref_id: string;
    source_uri: string;
    snippet_text: string;
    rerank_score: number;
  }>;
}

export interface DeepThinkCandidate {
  candidate: number;
  confidence: number;
  steps: number;
}

export interface DeepThinkFinal {
  final: string;
  citations: string[];
  residual_risk: string;
  verify_score: number;
}

export interface DeepThinkUsage {
  elapsed_ms: number;
  trace_id: string;
  total_tokens?: number;
  total_cost_usd?: number;
}

export function useDeepThink() {
  const [isRunning, setIsRunning] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<DeepThinkPhase | null>(null);
  const [plan, setPlan] = useState<DeepThinkPlan | null>(null);
  const [evidence, setEvidence] = useState<DeepThinkEvidence | null>(null);
  const [candidates, setCandidates] = useState<DeepThinkCandidate[]>([]);
  const [result, setResult] = useState<DeepThinkFinal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<DeepThinkUsage | null>(null);

  const startDeepThink = useCallback(async (goal: string) => {
    const supabase = getSupabase();

    try {
      setIsRunning(true);
      setCurrentPhase({ stage: 'planning', message: 'Initializing DeepThink...' });
      setPlan(null);
      setEvidence(null);
      setCandidates([]);
      setResult(null);
      setError(null);
      setUsage(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data: lane } = await supabase
        .from('ai_lanes')
        .select('id')
        .eq('name', 'deepthink_lane_gemini_v2_1_plus')
        .maybeSingle();

      if (!lane) {
        throw new Error('DeepThink lane not configured');
      }

      const { data: spaceRun, error: spaceRunError } = await supabase
        .from('space_runs')
        .insert({
          user_id: user.id,
          lane_id: lane.id,
          goal_prompt: goal,
          status: 'pending',
          trace_id: crypto.randomUUID()
        })
        .select()
        .single();

      if (spaceRunError || !spaceRun) {
        throw new Error('Failed to create space run');
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${SUPABASE_URL}/functions/v1/deepthink`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          goal,
          space_run_id: spaceRun.id
        })
      });

      if (!response.ok) {
        throw new Error(`DeepThink API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
            continue;
          }

          if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.slice(5).trim());
              handleDeepThinkEvent(currentEvent || 'data', data);
              currentEvent = '';
            } catch (e) {
              console.error('Failed to parse SSE data:', e);
            }
          }
        }
      }

      setIsRunning(false);
      setCurrentPhase({ stage: 'complete', message: 'DeepThink complete!' });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      setCurrentPhase({ stage: 'error', message: errorMessage });
      setIsRunning(false);
    }
  }, []);

  const handleDeepThinkEvent = useCallback((event: string, data: any) => {
    switch (event) {
      case 'progress':
        setCurrentPhase({
          stage: data.stage,
          message: data.message
        });
        break;

      case 'plan':
        setPlan(data);
        break;

      case 'evidence':
        setEvidence(data);
        break;

      case 'candidate':
        setCandidates(prev => [...prev, data]);
        break;

      case 'candidate_rejected':
        break;

      case 'final':
        setResult(data);
        setCurrentPhase({ stage: 'complete', message: 'Solution verified!' });
        break;

      case 'error':
        setError(data.message || data.reason || 'Unknown error');
        setCurrentPhase({ stage: 'error', message: data.message || 'Error occurred' });
        break;

      case 'done':
        setUsage(data);
        setIsRunning(false);
        break;
    }
  }, []);

  const reset = useCallback(() => {
    setIsRunning(false);
    setCurrentPhase(null);
    setPlan(null);
    setEvidence(null);
    setCandidates([]);
    setResult(null);
    setError(null);
    setUsage(null);
  }, []);

  return {
    isRunning,
    currentPhase,
    plan,
    evidence,
    candidates,
    result,
    error,
    usage,
    startDeepThink,
    reset
  };
}
