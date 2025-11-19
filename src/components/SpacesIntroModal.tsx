import React, { useState } from 'react';
import { X, Sparkles, FolderTree, Brain, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SpacesIntroModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const features = [
  {
    icon: FolderTree,
    title: 'Organized Workspaces',
    description: 'Create dedicated spaces for different projects, topics, or workflows. Keep your conversations perfectly organized.',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Brain,
    title: 'Custom AI Personalities',
    description: 'Define unique system prompts for each space. Your AI assistant adapts its behavior and expertise to match your needs.',
    color: 'from-purple-500 to-pink-500',
  },
  {
    icon: Zap,
    title: 'Persistent Memory',
    description: 'Each space maintains its own context and memory. Switch between spaces seamlessly without losing context.',
    color: 'from-amber-500 to-orange-500',
  },
];

export const SpacesIntroModal: React.FC<SpacesIntroModalProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < features.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="relative w-full max-w-2xl pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Glass card */}
              <div className="relative bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-pink-500/5 pointer-events-none" />

                {/* Close button */}
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 border border-white/10 transition-all duration-200 hover:scale-110"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-gray-300" />
                </button>

                {/* Content */}
                <div className="relative p-8 sm:p-12">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-400/30">
                      <Sparkles className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">Introducing Spaces</h2>
                      <p className="text-sm text-gray-400">Organize your AI conversations like never before</p>
                    </div>
                  </div>

                  {/* Feature showcase */}
                  <div className="min-h-[280px] mb-8">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentStep}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        className="space-y-6"
                      >
                        {/* Feature icon */}
                        <div className="flex justify-center">
                          <div className={`p-6 rounded-2xl bg-gradient-to-br ${features[currentStep].color} shadow-2xl`}>
                            {React.createElement(features[currentStep].icon, {
                              className: 'w-12 h-12 text-white',
                              strokeWidth: 2,
                            })}
                          </div>
                        </div>

                        {/* Feature content */}
                        <div className="text-center space-y-3">
                          <h3 className="text-xl font-semibold text-white">
                            {features[currentStep].title}
                          </h3>
                          <p className="text-gray-300 leading-relaxed max-w-lg mx-auto">
                            {features[currentStep].description}
                          </p>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* Progress indicators */}
                  <div className="flex justify-center gap-2 mb-8">
                    {features.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentStep(index)}
                        className={`h-2 rounded-full transition-all duration-300 ${
                          index === currentStep
                            ? 'w-8 bg-gradient-to-r from-blue-500 to-purple-500'
                            : 'w-2 bg-gray-600 hover:bg-gray-500'
                        }`}
                        aria-label={`Go to step ${index + 1}`}
                      />
                    ))}
                  </div>

                  {/* Navigation buttons */}
                  <div className="flex items-center justify-between gap-4">
                    <button
                      onClick={handlePrevious}
                      disabled={currentStep === 0}
                      className={`px-6 py-2.5 rounded-lg font-medium transition-all duration-200 ${
                        currentStep === 0
                          ? 'opacity-0 pointer-events-none'
                          : 'bg-gray-800 hover:bg-gray-700 text-white border border-white/10 hover:border-white/20'
                      }`}
                    >
                      Previous
                    </button>

                    <button
                      onClick={handleNext}
                      className="px-6 py-2.5 rounded-lg font-medium bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-200 hover:scale-105"
                    >
                      {currentStep === features.length - 1 ? 'Get Started' : 'Next'}
                    </button>
                  </div>

                  {/* Skip button */}
                  <div className="text-center mt-4">
                    <button
                      onClick={onClose}
                      className="text-sm text-gray-400 hover:text-gray-300 transition-colors duration-200"
                    >
                      Skip introduction
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
