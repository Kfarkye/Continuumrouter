/**
 * Mode Context Provider
 *
 * Manages mode selection state and effective context resolution across the app.
 * Provides hooks for accessing and updating mode state.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { SelectedMode, EffectiveContext } from '../lib/contextResolver';
import { resolveEffectiveContext } from '../lib/contextResolver';
import { supabase } from '../lib/supabaseClient';

interface ModeContextValue {
  selectedMode: SelectedMode;
  effectiveContext: EffectiveContext | null;
  isResolving: boolean;
  setSelectedMode: (mode: SelectedMode) => void;
  refreshContext: () => Promise<void>;
}

const ModeContext = createContext<ModeContextValue | undefined>(undefined);

interface ModeProviderProps {
  children: React.ReactNode;
  selectedSpaceId: string | null;
}

export function ModeProvider({ children, selectedSpaceId }: ModeProviderProps) {
  const [selectedMode, setSelectedModeState] = useState<SelectedMode>('chat');
  const [effectiveContext, setEffectiveContext] = useState<EffectiveContext | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  // Resolve effective context whenever mode or space changes
  const resolveContext = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setEffectiveContext(null);
      return;
    }

    setIsResolving(true);

    try {
      const context = await resolveEffectiveContext(
        user.id,
        selectedMode,
        selectedSpaceId
      );

      setEffectiveContext(context);
    } catch (error) {
      console.error('Error resolving context:', error);
      setEffectiveContext(null);
    } finally {
      setIsResolving(false);
    }
  }, [selectedMode, selectedSpaceId]);

  // Resolve context on mount and when dependencies change
  useEffect(() => {
    resolveContext();
  }, [resolveContext]);

  // Load saved mode preference on mount
  useEffect(() => {
    const loadModePreference = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('user_onboarding_state')
        .select('metadata')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data?.metadata?.preferred_mode) {
        setSelectedModeState(data.metadata.preferred_mode);
      }
    };

    loadModePreference();
  }, []);

  // Save mode preference when it changes
  const setSelectedMode = useCallback(async (mode: SelectedMode) => {
    setSelectedModeState(mode);

    // Save preference
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('user_onboarding_state')
      .upsert({
        user_id: user.id,
        metadata: { preferred_mode: mode },
      }, {
        onConflict: 'user_id',
      });
  }, []);

  const value: ModeContextValue = {
    selectedMode,
    effectiveContext,
    isResolving,
    setSelectedMode,
    refreshContext: resolveContext,
  };

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

/**
 * Hook to access mode context
 */
export function useModeContext() {
  const context = useContext(ModeContext);

  if (context === undefined) {
    throw new Error('useModeContext must be used within a ModeProvider');
  }

  return context;
}

/**
 * Hook to access only the effective context
 */
export function useEffectiveContext(): EffectiveContext | null {
  const { effectiveContext } = useModeContext();
  return effectiveContext;
}

/**
 * Hook to check if in a specific mode
 */
export function useIsMode(mode: SelectedMode): boolean {
  const { selectedMode } = useModeContext();
  return selectedMode === mode;
}

/**
 * Hook to check if in recruiting mode (general or clinician)
 */
export function useIsRecruiting(): boolean {
  const { effectiveContext } = useModeContext();
  return (
    effectiveContext?.effectiveMode === 'recruiting_general' ||
    effectiveContext?.effectiveMode === 'recruiting_clinician'
  );
}
