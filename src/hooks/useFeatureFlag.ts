import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface FeatureFlag {
  feature_name: string;
  enabled: boolean;
  rollout_percentage: number;
}

export function useFeatureFlag(flagName: string): boolean {
  const [isEnabled, setIsEnabled] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkFlag() {
      try {
        const { data, error } = await supabase
          .from('feature_flags')
          .select('enabled')
          .eq('feature_name', flagName)
          .maybeSingle();

        if (error) {
          console.error('Error fetching feature flag:', error);
          if (mounted) {
            setIsEnabled(true);
          }
          return;
        }

        if (mounted) {
          setIsEnabled(data?.enabled ?? true);
        }
      } catch (err) {
        console.error('Error checking feature flag:', err);
        if (mounted) {
          setIsEnabled(true);
        }
      }
    }

    checkFlag();

    return () => {
      mounted = false;
    };
  }, [flagName]);

  return isEnabled;
}
