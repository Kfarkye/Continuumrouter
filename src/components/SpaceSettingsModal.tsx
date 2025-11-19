import { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'react-hot-toast';

interface SpaceSettingsModalProps {
  spaceId: string | null;
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function SpaceSettingsModal({
  spaceId,
  userId,
  isOpen,
  onClose,
  onSave
}: SpaceSettingsModalProps) {
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && spaceId) {
      loadSpace();
    } else if (isOpen && !spaceId) {
      setName('');
      setSystemPrompt('');
    }
  }, [isOpen, spaceId]);

  const loadSpace = async () => {
    if (!spaceId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('name, system_prompt')
        .eq('id', spaceId)
        .single();

      if (error) throw error;

      setName(data.name || '');
      setSystemPrompt(data.system_prompt || '');
    } catch (error) {
      console.error('Failed to load space:', error);
      toast.error('Failed to load space settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!userId || !name.trim()) {
      toast.error('Space name is required');
      return;
    }

    setSaving(true);
    try {
      if (spaceId) {
        const { error } = await supabase
          .from('projects')
          .update({
            name: name.trim(),
            system_prompt: systemPrompt.trim() || null
          })
          .eq('id', spaceId);

        if (error) throw error;
        toast.success('Space updated successfully');
      } else {
        const { error } = await supabase
          .from('projects')
          .insert({
            user_id: userId,
            name: name.trim(),
            system_prompt: systemPrompt.trim() || null
          });

        if (error) throw error;
        toast.success('Space created successfully');
      }

      onSave();
      onClose();
    } catch (error) {
      console.error('Failed to save space:', error);
      toast.error('Failed to save space');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="absolute inset-0"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">
            {spaceId ? 'Edit Space' : 'New Space'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
          </div>
        ) : (
          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-zinc-300">
                Space Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Project"
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-colors"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-zinc-300">
                System Prompt
                <span className="ml-2 text-xs text-zinc-500 font-normal">
                  (Optional)
                </span>
              </label>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="You are a senior developer working on a React application using TypeScript, Vite, and Tailwind CSS. The codebase follows functional programming patterns and uses Supabase for backend..."
                rows={8}
                className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-colors resize-none"
              />
              <p className="text-xs text-zinc-500">
                Tell the AI about your project, tech stack, coding style, and preferences. This context will be used in all conversations within this space.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <button
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm text-zinc-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Space</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
