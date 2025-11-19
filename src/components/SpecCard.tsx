import React, { useState } from 'react';
import { DesignSpec } from '../hooks/useDesignSpecs';
import { Star, Trash2, Edit, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { ConfirmationModal } from './ConfirmationModal';

const SpecPreview: React.FC<{ spec: DesignSpec }> = ({ spec }) => {
  switch (spec.category) {
    case 'colors':
      const colors = Array.isArray(spec.spec_data.colors)
        ? spec.spec_data.colors
        : spec.spec_data.palette
        ? spec.spec_data.palette
        : [];
      return (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {colors.slice(0, 7).map((color: string, i: number) => (
            <div
              key={i}
              className="w-5 h-5 rounded-full border-2 border-white/20 shadow-sm"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      );
    case 'typography':
      return (
        <p
          className="mt-2 text-white/90 truncate"
          style={{
            fontSize: spec.spec_data.fontSize || '14px',
            fontWeight: spec.spec_data.fontWeight || 400,
            fontFamily: spec.spec_data.fontFamily || 'inherit',
          }}
        >
          The quick brown fox
        </p>
      );
    case 'spacing':
      return (
        <div className="flex items-center gap-2 mt-2">
          <div
            className="bg-blue-500/50 h-5 rounded-sm"
            style={{ width: spec.spec_data.value || '32px' }}
          />
          <span className="text-xs text-white/60 font-mono">
            {spec.spec_data.value || spec.spec_data.size}
          </span>
        </div>
      );
    default:
      return null;
  }
};

export const SpecCard: React.FC<{
  spec: DesignSpec;
  onDelete: (id: string) => void;
  onToggleFavorite: (spec: DesignSpec) => void;
  onEdit: (spec: DesignSpec) => void;
}> = ({ spec, onDelete, onToggleFavorite, onEdit }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <>
      <div className="glass rounded-xl p-4 group hover:bg-white/10 transition-all duration-300">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="text-sm font-semibold text-white/90 truncate">
                {spec.name}
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/60 capitalize">
                {spec.category}
              </span>
            </div>
            {spec.description && (
              <p className="text-xs text-white/50 line-clamp-2 mb-1">
                {spec.description}
              </p>
            )}
            {spec.tags && spec.tags.length > 0 && (
              <div className="flex gap-1 mt-1 flex-wrap">
                {spec.tags.slice(0, 3).map((tag, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <SpecPreview spec={spec} />
          </div>

          <div className="flex gap-1 items-center ml-2">
            <button
              onClick={() => onToggleFavorite(spec)}
              title="Toggle favorite"
              className={`p-2 rounded-lg transition-all ${
                spec.is_favorite
                  ? 'text-yellow-400 bg-white/10'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
              }`}
            >
              <Star
                className="w-4 h-4"
                strokeWidth={2}
                fill={spec.is_favorite ? 'currentColor' : 'none'}
              />
            </button>
            <button
              onClick={() => onEdit(spec)}
              title="Edit spec"
              className="p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
            >
              <Edit className="w-4 h-4" strokeWidth={2} />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              title="Delete spec"
              className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/5 transition-all"
            >
              <Trash2 className="w-4 h-4" strokeWidth={2} />
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              title="Show JSON"
              className="p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: 'auto', opacity: 1, marginTop: '12px' }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <SyntaxHighlighter
                language="json"
                style={atomOneDark}
                customStyle={{
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '12px',
                }}
              >
                {JSON.stringify(spec.spec_data, null, 2)}
              </SyntaxHighlighter>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          onDelete(spec.id);
          setShowDeleteConfirm(false);
        }}
        title="Delete Design Spec"
        message={`Are you sure you want to delete "${spec.name}"? This action cannot be undone.`}
      />
    </>
  );
};
