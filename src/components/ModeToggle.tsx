/**
 * Mode Toggle Component
 *
 * Provides UI for switching between Chat and Recruiting modes.
 * Displays the current effective context and handles mode transitions.
 */

import React from 'react';
import { MessageSquare, Users } from 'lucide-react';
import type { SelectedMode, EffectiveContext } from '../lib/contextResolver';
import { formatContextDisplay } from '../lib/contextResolver';

interface ModeToggleProps {
  selectedMode: SelectedMode;
  context: EffectiveContext;
  onModeChange: (mode: SelectedMode) => void;
  disabled?: boolean;
}

export function ModeToggle({ selectedMode, context, onModeChange, disabled = false }: ModeToggleProps) {
  const handleModeClick = (mode: SelectedMode) => {
    if (!disabled && mode !== selectedMode) {
      onModeChange(mode);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Mode Toggle Buttons */}
      <div className="flex items-center gap-1 bg-white/5 backdrop-blur-md rounded-lg p-1 border border-white/10">
        <button
          onClick={() => handleModeClick('chat')}
          disabled={disabled}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all duration-200
            ${selectedMode === 'chat'
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
              : 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          title="Switch to Chat Mode"
        >
          <MessageSquare className="w-4 h-4" />
          <span className="text-sm">Chat</span>
        </button>

        <button
          onClick={() => handleModeClick('recruiting')}
          disabled={disabled}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all duration-200
            ${selectedMode === 'recruiting'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
              : 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
          title="Switch to Recruiting Mode"
        >
          <Users className="w-4 h-4" />
          <span className="text-sm">Recruiting</span>
        </button>
      </div>

      {/* Context Display Badge */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white/5 backdrop-blur-md rounded-lg border border-white/10">
        <div className={`
          w-2 h-2 rounded-full
          ${context.effectiveMode === 'chat' ? 'bg-blue-400' : 'bg-purple-400'}
        `} />
        <span className="text-xs text-gray-300 font-medium">
          {formatContextDisplay(context)}
        </span>
      </div>
    </div>
  );
}

/**
 * Compact Mode Toggle for mobile/tablet
 */
export function CompactModeToggle({ selectedMode, context, onModeChange, disabled = false }: ModeToggleProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Compact Toggle */}
      <div className="flex items-center bg-white/5 backdrop-blur-md rounded-lg p-1 border border-white/10">
        <button
          onClick={() => onModeChange('chat')}
          disabled={disabled}
          className={`
            p-2 rounded transition-all duration-200
            ${selectedMode === 'chat'
              ? 'bg-blue-500/20 text-blue-300'
              : 'text-gray-400 hover:text-gray-300'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          title="Chat Mode"
        >
          <MessageSquare className="w-4 h-4" />
        </button>

        <button
          onClick={() => onModeChange('recruiting')}
          disabled={disabled}
          className={`
            p-2 rounded transition-all duration-200
            ${selectedMode === 'recruiting'
              ? 'bg-purple-500/20 text-purple-300'
              : 'text-gray-400 hover:text-gray-300'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          title="Recruiting Mode"
        >
          <Users className="w-4 h-4" />
        </button>
      </div>

      {/* Context indicator */}
      <div className={`
        w-2 h-2 rounded-full
        ${context.effectiveMode === 'chat' ? 'bg-blue-400' : 'bg-purple-400'}
      `} />
    </div>
  );
}

/**
 * Mode Transition Confirmation Modal
 */
interface ModeTransitionModalProps {
  isOpen: boolean;
  oldMode: SelectedMode;
  newMode: SelectedMode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ModeTransitionModal({
  isOpen,
  oldMode,
  newMode,
  onConfirm,
  onCancel,
}: ModeTransitionModalProps) {
  if (!isOpen) return null;

  const getModeName = (mode: SelectedMode) => {
    return mode === 'chat' ? 'Chat' : 'Recruiting';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-800/95 backdrop-blur-xl rounded-xl border border-white/10 shadow-2xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-white mb-2">
          Switch to {getModeName(newMode)} Mode?
        </h3>

        <p className="text-sm text-gray-300 mb-4">
          Switching modes will start a new conversation to maintain context isolation.
          Your current conversation will be saved and can be accessed from the history.
        </p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-all duration-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-all duration-200"
          >
            Switch Mode
          </button>
        </div>
      </div>
    </div>
  );
}
