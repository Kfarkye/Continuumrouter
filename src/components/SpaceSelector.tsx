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
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-zinc-900/50 hover:bg-zinc-800/80 rounded-lg border border-white/10 transition-all duration-200 hover:border-white/20 hover:shadow-glass-sm group"
      >
        <FolderOpen className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
        <span className="text-zinc-300 font-medium tracking-tight">
          {selectedSpace ? selectedSpace.name : 'No Space'}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 mt-2 w-64 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-glass z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              <button
                onClick={() => {
                  onSelectSpace(null);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center gap-2.5 ${!selectedSpaceId
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                  }`}
              >
                <FolderOpen className="w-4 h-4 opacity-70" />
                <span>No Space (Global)</span>
              </button>

              {spaces.length > 0 && (
                <div className="border-t border-white/5">
                  {spaces.map((space) => (
                    <button
                      key={space.id}
                      onClick={() => {
                        console.log('[SpaceSelector] Selected space:', space.id, space.name);
                        onSelectSpace(space.id);
                        setIsOpen(false);
                      }}
                      className={`w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center justify-between gap-2 ${selectedSpaceId === space.id
                          ? 'bg-white/10 text-white font-medium'
                          : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
                        }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FolderOpen className="w-4 h-4 opacity-70 flex-shrink-0" />
                        <span className="truncate">{space.name}</span>
                      </div>
                      {space.system_prompt && (
                        <span className="w-1.5 h-1.5 bg-emerald-500/80 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.4)] flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div className="border-t border-white/5 p-1">
                <button
                  onClick={() => {
                    onCreateSpace();
                    setIsOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 rounded-lg transition-colors flex items-center gap-2 font-medium"
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
