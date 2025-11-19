import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface OnboardingState {
  hasSeenSpacesIntro: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useOnboardingState(userId: string | undefined) {
  const [state, setState] = useState<OnboardingState>({
    hasSeenSpacesIntro: true, // Default to true to avoid showing on load
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    if (!userId) {
      setState({ hasSeenSpacesIntro: true, isLoading: false, error: null });
      return;
    }

    let cancelled = false;

    async function loadOnboardingState() {
      try {
        const { data, error } = await supabase
          .from('user_onboarding_state')
          .select('has_seen_spaces_intro')
          .eq('user_id', userId)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          console.error('Failed to load onboarding state:', error);
          setState({ hasSeenSpacesIntro: true, isLoading: false, error: error.message });
          return;
        }

        // If no record exists, user hasn't seen the intro
        if (!data) {
          setState({ hasSeenSpacesIntro: false, isLoading: false, error: null });
        } else {
          setState({
            hasSeenSpacesIntro: data.has_seen_spaces_intro ?? false,
            isLoading: false,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading onboarding state:', err);
          setState({ hasSeenSpacesIntro: true, isLoading: false, error: String(err) });
        }
      }
    }

    loadOnboardingState();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const markSpacesIntroAsSeen = async () => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from('user_onboarding_state')
        .upsert(
          {
            user_id: userId,
            has_seen_spaces_intro: true,
          },
          {
            onConflict: 'user_id',
          }
        );

      if (error) {
        console.error('Failed to update onboarding state:', error);
        return;
      }

      setState((prev) => ({ ...prev, hasSeenSpacesIntro: true }));
    } catch (err) {
      console.error('Error updating onboarding state:', err);
    }
  };

  return {
    ...state,
    markSpacesIntroAsSeen,
  };
}
