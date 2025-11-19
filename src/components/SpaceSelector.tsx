import { useState, useEffect } from 'react';
import { ChevronDown, FolderOpen, Plus } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface Space {
  id: string;
  name: string;
  system_prompt: string | null;
  clinician_id: string | null;
}

interface SpaceSelectorProps {
  userId: string | null;
  selectedSpaceId: string | null;
  onSelectSpace: (spaceId: string | null) => void;
  onCreateSpace: () => void;
}

export function SpaceSelector({
  userId,
  selectedSpaceId,
  onSelectSpace,
  onCreateSpace
}: SpaceSelectorProps) {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (userId) {
      loadSpaces();
    }
  }, [userId]);

  const loadSpaces = async () => {
    if (!userId) {
      console.log('[SpaceSelector] No userId, skipping load');
      return;
    }

    setLoading(true);
    try {
      console.log('[SpaceSelector] Loading spaces for userId:', userId);

      // Check if user is authenticated
      const { data: sessionData } = await supabase.auth.getSession();
      console.log('[SpaceSelector] Session:', sessionData.session ? 'authenticated' : 'NOT authenticated');

      const { data, error } = await supabase
        .from('projects')
        .select('id, name, system_prompt, clinician_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[SpaceSelector] Query error:', error);
        throw error;
      }
      console.log('[SpaceSelector] Loaded spaces count:', data?.length || 0);
      console.log('[SpaceSelector] Loaded spaces:', data);
      setSpaces(data || []);
    } catch (error) {
      console.error('[SpaceSelector] Failed to load spaces:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedSpace = spaces.find(s => s.id === selectedSpaceId);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors"
      >
        <FolderOpen className="w-4 h-4 text-zinc-400" />
        <span className="text-zinc-300">
          {selectedSpace ? selectedSpace.name : 'No Space'}
        </span>
        <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-2 w-64 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              <button
                onClick={() => {
                  onSelectSpace(null);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-2.5 text-left text-sm hover:bg-white/5 transition-colors ${
                  !selectedSpaceId ? 'bg-white/10 text-white' : 'text-zinc-400'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4" />
                  <span>No Space (Global)</span>
                </div>
              </button>

              {spaces.length > 0 && (
                <div className="border-t border-white/10">
                  {spaces.map((space) => (
                    <button
                      key={space.id}
                      onClick={() => {
                        console.log('[SpaceSelector] Selected space:', space.id, space.name);
                        onSelectSpace(space.id);
                        setIsOpen(false);
                      }}
                      className={`w-full px-4 py-2.5 text-left text-sm hover:bg-white/5 transition-colors ${
                        selectedSpaceId === space.id ? 'bg-white/10 text-white' : 'text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <FolderOpen className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{space.name}</span>
                        </div>
                        {space.system_prompt && (
                          <span className="text-xs text-emerald-400 flex-shrink-0">●</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="border-t border-white/10">
                <button
                  onClick={() => {
                    onCreateSpace();
                    setIsOpen(false);
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm text-emerald-400 hover:bg-white/5 transition-colors flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Space</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
