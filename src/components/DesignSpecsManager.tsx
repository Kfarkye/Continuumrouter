import React, { useState, useMemo } from 'react';
import { useDesignSpecs, DesignSpec } from '../hooks/useDesignSpecs';
import { Plus, Search, LayoutGrid } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { SpecCard } from './SpecCard';
import { CreateEditSpecModal } from './CreateEditSpecModal';
import { SkeletonLoader } from './SkeletonLoader';

const TABS = [
  { id: 'saved', label: 'Saved Specs' },
  { id: 'library', label: 'Design Library' }
];

const CATEGORIES = [
  { id: 'all', name: 'All' },
  { id: 'colors', name: 'Colors' },
  { id: 'typography', name: 'Typography' },
  { id: 'spacing', name: 'Spacing' },
  { id: 'components', name: 'Components' },
  { id: 'other', name: 'Other' },
];

interface DesignSpecsManagerProps {
  userId: string;
}

export const DesignSpecsManager: React.FC<DesignSpecsManagerProps> = ({ userId }) => {
  const { specs, loading, createSpec, updateSpec, deleteSpec, toggleFavorite } = useDesignSpecs(userId);

  const [activeTab, setActiveTab] = useState<'saved' | 'library'>('saved');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [specToEdit, setSpecToEdit] = useState<DesignSpec | null>(null);

  const filteredSpecs = useMemo(() => {
    return specs.filter(spec => {
      const categoryMatch = selectedCategory === 'all' || spec.category === selectedCategory;
      const searchMatch = searchTerm === '' ||
        spec.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        spec.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        spec.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
      return categoryMatch && searchMatch;
    });
  }, [specs, selectedCategory, searchTerm]);

  const handleEdit = (spec: DesignSpec) => {
    setSpecToEdit(spec);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSpecToEdit(null);
    setIsModalOpen(true);
  };

  const handleSaveFromLibrary = (specData: Omit<DesignSpec, 'id' | 'created_at' | 'updated_at' | 'user_id'>) => {
    createSpec(specData);
    setActiveTab('saved');
  };

  return (
    <div className="h-full flex flex-col bg-gray-900/30 backdrop-blur-xl p-4 rounded-2xl border border-white/10">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">Design Specs</h2>
        <div className="flex gap-1 p-1 rounded-lg glass">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors relative ${
                activeTab === tab.id ? 'text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeTabIndicator"
                  className="absolute inset-0 bg-white/10 rounded-md"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </button>
          ))}
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="flex-1 flex flex-col min-h-0"
        >
          {activeTab === 'saved' ? (
            <>
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    type="text"
                    placeholder="Search specs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-white/5 text-white/80 placeholder-white/40 border border-transparent focus:border-blue-500 focus:bg-white/10 outline-none transition-all"
                  />
                </div>
                <button
                  onClick={handleCreate}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-500 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Spec
                </button>
              </div>

              <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                      selectedCategory === cat.id
                        ? 'bg-white/20 text-white'
                        : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                {loading ? (
                  <SkeletonLoader count={5} />
                ) : filteredSpecs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-white/60">
                    <LayoutGrid className="w-12 h-12 text-white/20 mb-4" />
                    <h3 className="font-semibold">
                      {searchTerm ? 'No specs found' : 'No specs in this category'}
                    </h3>
                    <p className="text-sm text-white/40 mt-1">
                      {searchTerm ? 'Try a different search term.' : 'Create a new spec or save one from the library.'}
                    </p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {filteredSpecs.map(spec => (
                      <motion.div
                        key={spec.id}
                        layout
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                      >
                        <SpecCard
                          spec={spec}
                          onDelete={deleteSpec}
                          onToggleFavorite={toggleFavorite}
                          onEdit={handleEdit}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </>
          ) : (
            <DesignLibrary onSave={handleSaveFromLibrary} />
          )}
        </motion.div>
      </AnimatePresence>

      <CreateEditSpecModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={specToEdit ? updateSpec : createSpec}
        specToEdit={specToEdit}
      />
    </div>
  );
};

const DesignLibrary: React.FC<{ onSave: (specData: Omit<DesignSpec, 'id' | 'created_at' | 'updated_at' | 'user_id'>) => void }> = ({ onSave }) => {
  const colorPalettes = [
    { name: 'Material Blue', colors: ['#2196F3', '#1976D2', '#1565C0', '#0D47A1', '#42A5F5'] },
    { name: 'Warm Sunset', colors: ['#FF6B6B', '#FF8E53', '#FFA931', '#FFC107', '#FFD54F'] },
    { name: 'Forest Green', colors: ['#1B5E20', '#2E7D32', '#43A047', '#66BB6A', '#81C784'] },
    { name: 'Purple Haze', colors: ['#4A148C', '#6A1B9A', '#8E24AA', '#AB47BC', '#CE93D8'] },
    { name: 'Ocean Breeze', colors: ['#006064', '#00838F', '#00ACC1', '#26C6DA', '#4DD0E1'] },
  ];

  const typographySpecs = [
    { name: 'Heading XL', fontSize: '48px', fontWeight: 700, lineHeight: 1.2 },
    { name: 'Heading Large', fontSize: '36px', fontWeight: 700, lineHeight: 1.2 },
    { name: 'Heading Medium', fontSize: '24px', fontWeight: 600, lineHeight: 1.3 },
    { name: 'Body Large', fontSize: '18px', fontWeight: 400, lineHeight: 1.6 },
    { name: 'Body Regular', fontSize: '16px', fontWeight: 400, lineHeight: 1.5 },
  ];

  const spacingSpecs = [
    { name: 'Extra Small', value: '4px' },
    { name: 'Small', value: '8px' },
    { name: 'Medium', value: '16px' },
    { name: 'Large', value: '24px' },
    { name: 'Extra Large', value: '32px' },
  ];

  const handleSave = (name: string, category: DesignSpec['category'], data: any, description?: string) => {
    onSave({
      name,
      category,
      spec_data: data,
      description,
      tags: [],
      is_favorite: false,
    });
  };

  return (
    <div className="flex-1 overflow-y-auto pr-1 space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-white/90 mb-3">Color Palettes</h3>
        <div className="space-y-3">
          {colorPalettes.map((palette, idx) => (
            <div key={idx} className="glass rounded-xl p-4 group hover:bg-white/10 transition-colors">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-sm font-medium text-white/90">{palette.name}</h4>
                <button
                  onClick={() => handleSave(palette.name, 'colors', { colors: palette.colors }, `${palette.colors.length} color palette`)}
                  className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
                >
                  Save
                </button>
              </div>
              <div className="flex gap-2">
                {palette.colors.map((color, i) => (
                  <div
                    key={i}
                    className="w-10 h-10 rounded-lg border-2 border-white/20 shadow-sm"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-white/90 mb-3">Typography</h3>
        <div className="space-y-3">
          {typographySpecs.map((typo, idx) => (
            <div key={idx} className="glass rounded-xl p-4 group hover:bg-white/10 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-white/90 mb-1">{typo.name}</h4>
                  <p
                    className="text-white/80 truncate"
                    style={{
                      fontSize: typo.fontSize,
                      fontWeight: typo.fontWeight,
                      lineHeight: typo.lineHeight,
                    }}
                  >
                    The quick brown fox
                  </p>
                </div>
                <button
                  onClick={() => handleSave(typo.name, 'typography', typo, `Font size: ${typo.fontSize}, Weight: ${typo.fontWeight}`)}
                  className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
                >
                  Save
                </button>
              </div>
              <p className="text-xs text-white/50">
                {typo.fontSize} · {typo.fontWeight} · Line height: {typo.lineHeight}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-white/90 mb-3">Spacing</h3>
        <div className="space-y-3">
          {spacingSpecs.map((spacing, idx) => (
            <div key={idx} className="glass rounded-xl p-4 group hover:bg-white/10 transition-colors">
              <div className="flex justify-between items-center">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-white/90 mb-2">{spacing.name}</h4>
                  <div className="flex items-center gap-2">
                    <div
                      className="bg-blue-500/50 h-6 rounded-sm"
                      style={{ width: spacing.value }}
                    />
                    <span className="text-xs text-white/60 font-mono">{spacing.value}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleSave(spacing.name, 'spacing', { value: spacing.value }, `Spacing value: ${spacing.value}`)}
                  className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
