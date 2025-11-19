import { useState, useEffect, useCallback } from 'react';
import {
  getUserContext,
  saveUserContext,
  toggleContextActive,
  UserContext,
} from '../services/contextService';
import { trackContextSave, trackContextToggle } from '../lib/analytics';

export function useContextManager(userId?: string) {
  const [context, setContext] = useState<UserContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let mounted = true;

    async function loadContext() {
      try {
        const data = await getUserContext(userId);
        if (mounted) {
          setContext(data);
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadContext();

    return () => {
      mounted = false;
    };
  }, [userId]);

  const saveContext = useCallback(
    async (content: string, isActive: boolean) => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      setSyncing(true);
      setError(null);

      try {
        const updated = await saveUserContext(userId, content, isActive);
        setContext(updated);

        trackContextSave(
          updated.character_count,
          updated.token_estimate,
          updated.is_active
        );
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setSyncing(false);
      }
    },
    [userId]
  );

  const toggleActive = useCallback(
    async (isActive: boolean) => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      setSyncing(true);
      setError(null);

      try {
        const updated = await toggleContextActive(userId, isActive);
        setContext(updated);

        trackContextToggle(updated.is_active);
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        setSyncing(false);
      }
    },
    [userId]
  );

  return {
    context,
    loading,
    syncing,
    error,
    saveContext,
    toggleActive,
  };
}
