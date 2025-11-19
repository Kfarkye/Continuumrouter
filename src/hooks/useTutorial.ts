import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Tutorial, TutorialStep, TutorialWithSteps, CreateTutorialRequest } from '../types';

export interface UseTutorialReturn {
  currentTutorial: TutorialWithSteps | null;
  currentStepIndex: number;
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  tutorials: Tutorial[];
  createTutorial: (request: CreateTutorialRequest) => Promise<string | null>;
  loadTutorial: (tutorialId: string) => Promise<void>;
  deleteTutorial: (tutorialId: string) => Promise<void>;
  nextStep: () => void;
  previousStep: () => void;
  goToStep: (stepIndex: number) => void;
  markStepCompleted: (stepNumber: number) => Promise<void>;
  reset: () => void;
}

export function useTutorial(userId: string): UseTutorialReturn {
  const [currentTutorial, setCurrentTutorial] = useState<TutorialWithSteps | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);

  // Fetch all tutorials for the user
  const fetchTutorials = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('tutorials')
        .select('*')
        .eq('user_id', userId)
        .order('last_accessed_at', { ascending: false });

      if (error) throw error;
      setTutorials(data || []);
    } catch (err) {
      console.error('Error fetching tutorials:', err);
    }
  }, [userId]);

  // Fetch tutorials on mount
  useEffect(() => {
    if (userId) {
      fetchTutorials();
    }
  }, [userId, fetchTutorials]);

  // Create a new tutorial by calling the edge function
  const createTutorial = useCallback(async (request: CreateTutorialRequest): Promise<string | null> => {
    try {
      setIsGenerating(true);
      setError(null);

      // First, create the tutorial record in the database
      const { data: tutorial, error: insertError } = await supabase
        .from('tutorials')
        .insert({
          user_id: userId,
          title: request.title || `Tutorial: ${request.language}`,
          code: request.code,
          language: request.language,
          project_id: request.project_id,
          status: 'processing',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Call the edge function to generate tutorial steps
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) throw new Error('No access token available');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tutorial-generator`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            tutorial_id: tutorial.id,
            code: request.code,
            language: request.language,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to generate tutorial');
      }

      const result = await response.json();

      // Update tutorial status to ready
      await supabase
        .from('tutorials')
        .update({
          status: 'ready',
          total_steps: result.steps?.length || 0,
        })
        .eq('id', tutorial.id);

      // Refresh tutorials list
      await fetchTutorials();

      return tutorial.id;
    } catch (err) {
      console.error('Error creating tutorial:', err);
      setError(err instanceof Error ? err.message : 'Failed to create tutorial');
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [userId, fetchTutorials]);

  // Load a specific tutorial with its steps
  const loadTutorial = useCallback(async (tutorialId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch tutorial
      const { data: tutorial, error: tutorialError } = await supabase
        .from('tutorials')
        .select('*')
        .eq('id', tutorialId)
        .single();

      if (tutorialError) throw tutorialError;

      // Fetch tutorial steps
      const { data: steps, error: stepsError } = await supabase
        .from('tutorial_steps')
        .select('*')
        .eq('tutorial_id', tutorialId)
        .order('step_number', { ascending: true });

      if (stepsError) throw stepsError;

      // Update last accessed timestamp
      await supabase
        .from('tutorials')
        .update({ last_accessed_at: new Date().toISOString() })
        .eq('id', tutorialId);

      setCurrentTutorial({
        ...tutorial,
        steps: steps || [],
      });

      // Calculate current step based on completion
      const firstIncompleteIndex = steps?.findIndex(s => !s.is_completed) ?? 0;
      setCurrentStepIndex(firstIncompleteIndex >= 0 ? firstIncompleteIndex : 0);
    } catch (err) {
      console.error('Error loading tutorial:', err);
      setError(err instanceof Error ? err.message : 'Failed to load tutorial');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Delete a tutorial
  const deleteTutorial = useCallback(async (tutorialId: string) => {
    try {
      const { error } = await supabase
        .from('tutorials')
        .delete()
        .eq('id', tutorialId);

      if (error) throw error;

      // If the deleted tutorial is currently loaded, clear it
      if (currentTutorial?.id === tutorialId) {
        setCurrentTutorial(null);
        setCurrentStepIndex(0);
      }

      // Refresh tutorials list
      await fetchTutorials();
    } catch (err) {
      console.error('Error deleting tutorial:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete tutorial');
    }
  }, [currentTutorial, fetchTutorials]);

  // Navigate to next step
  const nextStep = useCallback(() => {
    if (!currentTutorial) return;
    const maxIndex = currentTutorial.steps.length - 1;
    setCurrentStepIndex(prev => Math.min(prev + 1, maxIndex));
  }, [currentTutorial]);

  // Navigate to previous step
  const previousStep = useCallback(() => {
    setCurrentStepIndex(prev => Math.max(prev - 1, 0));
  }, []);

  // Go to a specific step
  const goToStep = useCallback((stepIndex: number) => {
    if (!currentTutorial) return;
    const maxIndex = currentTutorial.steps.length - 1;
    setCurrentStepIndex(Math.max(0, Math.min(stepIndex, maxIndex)));
  }, [currentTutorial]);

  // Mark a step as completed and update progress
  const markStepCompleted = useCallback(async (stepNumber: number) => {
    if (!currentTutorial) return;

    try {
      const step = currentTutorial.steps.find(s => s.step_number === stepNumber);
      if (!step || step.is_completed) return;

      // Update step completion
      await supabase
        .from('tutorial_steps')
        .update({ is_completed: true })
        .eq('id', step.id);

      // Calculate new completion percentage
      const completedSteps = currentTutorial.steps.filter(s =>
        s.step_number === stepNumber || s.is_completed
      ).length;
      const completionPercentage = Math.round((completedSteps / currentTutorial.steps.length) * 100);

      // Update tutorial progress
      await supabase
        .from('tutorials')
        .update({ completion_percentage: completionPercentage })
        .eq('id', currentTutorial.id);

      // Update local state
      setCurrentTutorial(prev => {
        if (!prev) return null;
        return {
          ...prev,
          completion_percentage: completionPercentage,
          steps: prev.steps.map(s =>
            s.step_number === stepNumber ? { ...s, is_completed: true } : s
          ),
        };
      });
    } catch (err) {
      console.error('Error marking step completed:', err);
    }
  }, [currentTutorial]);

  // Reset current tutorial state
  const reset = useCallback(() => {
    setCurrentTutorial(null);
    setCurrentStepIndex(0);
    setError(null);
  }, []);

  return {
    currentTutorial,
    currentStepIndex,
    isLoading,
    isGenerating,
    error,
    tutorials,
    createTutorial,
    loadTutorial,
    deleteTutorial,
    nextStep,
    previousStep,
    goToStep,
    markStepCompleted,
    reset,
  };
}
