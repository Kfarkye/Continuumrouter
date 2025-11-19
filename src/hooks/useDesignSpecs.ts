import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'react-hot-toast';
import { PostgrestError } from '@supabase/supabase-js';

export interface DesignSpec {
  id: string;
  user_id: string;
  name: string;
  category: 'colors' | 'typography' | 'spacing' | 'components' | 'other';
  spec_data: any;
  description?: string;
  tags?: string[];
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export const useDesignSpecs = (userId: string) => {
  const [specs, setSpecs] = useState<DesignSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PostgrestError | null>(null);

  const loadSpecs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('design_specs')
        .select('*')
        .eq('user_id', userId)
        .order('is_favorite', { ascending: false })
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setSpecs(data || []);
    } catch (err: any) {
      setError(err);
      toast.error('Failed to load design specs.');
      console.error('Error loading specs:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      loadSpecs();
    }
  }, [userId, loadSpecs]);

  const createSpec = async (newSpecData: Omit<DesignSpec, 'id' | 'created_at' | 'updated_at' | 'user_id'>) => {
    const tempId = `temp-${Date.now()}`;
    const newSpec: DesignSpec = {
      ...newSpecData,
      id: tempId,
      user_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setSpecs(prev => [newSpec, ...prev]);

    const { data, error } = await supabase
      .from('design_specs')
      .insert({ ...newSpecData, user_id: userId })
      .select()
      .single();

    if (error) {
      toast.error('Failed to create spec.');
      setSpecs(prev => prev.filter(s => s.id !== tempId));
      return null;
    }

    setSpecs(prev => prev.map(s => s.id === tempId ? data : s));
    toast.success('Design spec created!');
    return data;
  };

  const updateSpec = async (specId: string, updates: Partial<DesignSpec>) => {
    const originalSpecs = [...specs];

    setSpecs(prev => prev.map(s => s.id === specId ? { ...s, ...updates, updated_at: new Date().toISOString() } : s));

    const { data, error } = await supabase
      .from('design_specs')
      .update(updates)
      .eq('id', specId)
      .select()
      .single();

    if (error) {
      toast.error('Failed to update spec.');
      setSpecs(originalSpecs);
      return null;
    }

    toast.success('Design spec updated!');
    return data;
  };

  const deleteSpec = async (specId: string) => {
    const originalSpecs = [...specs];

    setSpecs(prev => prev.filter(s => s.id !== specId));

    const { error } = await supabase
      .from('design_specs')
      .delete()
      .eq('id', specId);

    if (error) {
      toast.error('Failed to delete spec.');
      setSpecs(originalSpecs);
    } else {
      toast.success('Design spec deleted.');
    }
  };

  const toggleFavorite = (spec: DesignSpec) => {
    updateSpec(spec.id, { is_favorite: !spec.is_favorite });
  };

  return { specs, loading, error, createSpec, updateSpec, deleteSpec, toggleFavorite, reload: loadSpecs };
};
