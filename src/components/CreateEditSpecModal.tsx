import React, { useState, useEffect } from 'react';
import { DesignSpec } from '../hooks/useDesignSpecs';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Save, Tag } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const CreateEditSpecModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: ((id: string, data: Partial<DesignSpec>) => void) | ((data: Omit<DesignSpec, 'id' | 'created_at' | 'updated_at' | 'user_id'>) => void);
  specToEdit: DesignSpec | null;
}> = ({ isOpen, onClose, onSave, specToEdit }) => {
  const [formData, setFormData] = useState({
    name: '',
    category: 'other' as DesignSpec['category'],
    description: '',
    spec_data: '{}',
    tags: '',
    is_favorite: false,
  });

  useEffect(() => {
    if (specToEdit) {
      setFormData({
        name: specToEdit.name,
        category: specToEdit.category,
        description: specToEdit.description || '',
        spec_data: JSON.stringify(specToEdit.spec_data, null, 2),
        tags: specToEdit.tags?.join(', ') || '',
        is_favorite: specToEdit.is_favorite,
      });
    } else {
      setFormData({
        name: '',
        category: 'other',
        description: '',
        spec_data: '{\n  "key": "value"\n}',
        tags: '',
        is_favorite: false,
      });
    }
  }, [specToEdit, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsedData = JSON.parse(formData.spec_data);
      const tags = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const saveData = {
        name: formData.name,
        category: formData.category,
        description: formData.description,
        spec_data: parsedData,
        tags,
        is_favorite: formData.is_favorite,
      };

      if (specToEdit) {
        (onSave as (id: string, data: Partial<DesignSpec>) => void)(specToEdit.id, saveData);
      } else {
        (onSave as (data: any) => void)(saveData);
      }
      onClose();
    } catch (error) {
      toast.error('Invalid JSON in spec data.');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="bg-gray-800 border border-white/20 rounded-2xl p-6 w-full max-w-2xl text-white max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {specToEdit ? 'Edit' : 'Create'} Design Spec
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Primary Color Palette"
                  className="w-full p-3 bg-black/30 rounded-lg border border-white/20 focus:border-blue-500 outline-none text-white placeholder-white/40"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Category *
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(f => ({ ...f, category: e.target.value as DesignSpec['category'] }))}
                  className="w-full p-3 bg-black/30 rounded-lg border border-white/20 focus:border-blue-500 outline-none text-white"
                  required
                >
                  <option value="colors">Colors</option>
                  <option value="typography">Typography</option>
                  <option value="spacing">Spacing</option>
                  <option value="components">Components</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional description"
                  className="w-full p-3 bg-black/30 rounded-lg border border-white/20 focus:border-blue-500 outline-none text-white placeholder-white/40"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1 flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData(f => ({ ...f, tags: e.target.value }))}
                  placeholder="e.g., primary, brand, web"
                  className="w-full p-3 bg-black/30 rounded-lg border border-white/20 focus:border-blue-500 outline-none text-white placeholder-white/40"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Spec Data (JSON) *
                </label>
                <textarea
                  value={formData.spec_data}
                  onChange={(e) => setFormData(f => ({ ...f, spec_data: e.target.value }))}
                  placeholder='{ "key": "value" }'
                  className="w-full h-64 p-3 font-mono text-sm bg-black/30 rounded-lg border border-white/20 focus:border-blue-500 outline-none text-white placeholder-white/40"
                  required
                />
                <p className="text-xs text-white/50 mt-1">
                  Enter valid JSON data for this design spec
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_favorite"
                  checked={formData.is_favorite}
                  onChange={(e) => setFormData(f => ({ ...f, is_favorite: e.target.checked }))}
                  className="w-4 h-4 rounded border-white/20 bg-black/30 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="is_favorite" className="text-sm text-white/80">
                  Mark as favorite
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors font-medium flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save Spec
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
