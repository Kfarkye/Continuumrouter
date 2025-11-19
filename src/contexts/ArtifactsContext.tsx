import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Artifact } from '../types';

interface ArtifactsContextType {
  currentArtifact: Artifact | null;
  artifactHistory: Artifact[];
  isOpen: boolean;
  panelWidth: number;
  openArtifact: (artifact: Artifact) => void;
  closeArtifact: () => void;
  navigateHistory: (direction: 'prev' | 'next') => void;
  updateArtifact: (updates: Partial<Artifact>) => void;
  setPanelWidth: (width: number) => void;
  clearHistory: () => void;
}

const ArtifactsContext = createContext<ArtifactsContextType | undefined>(undefined);

interface ArtifactsProviderProps {
  children: ReactNode;
}

const MIN_PANEL_WIDTH = 400;
const MAX_PANEL_WIDTH_PERCENT = 60;
const DEFAULT_PANEL_WIDTH = 600;

export const ArtifactsProvider: React.FC<ArtifactsProviderProps> = ({ children }) => {
  const [currentArtifact, setCurrentArtifact] = useState<Artifact | null>(null);
  const [artifactHistory, setArtifactHistory] = useState<Artifact[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [panelWidth, setPanelWidthState] = useState(DEFAULT_PANEL_WIDTH);

  const openArtifact = useCallback((artifact: Artifact) => {
    setCurrentArtifact(artifact);
    setIsOpen(true);

    // Add to history if it's not already the current artifact
    setArtifactHistory(prev => {
      const filtered = prev.filter(a => a.id !== artifact.id);
      return [artifact, ...filtered].slice(0, 10); // Keep last 10 artifacts
    });
  }, []);

  const closeArtifact = useCallback(() => {
    setIsOpen(false);
    // Don't clear currentArtifact immediately to allow smooth close animation
    setTimeout(() => setCurrentArtifact(null), 300);
  }, []);

  const navigateHistory = useCallback((direction: 'prev' | 'next') => {
    if (!currentArtifact || artifactHistory.length === 0) return;

    const currentIndex = artifactHistory.findIndex(a => a.id === currentArtifact.id);
    if (currentIndex === -1) return;

    const newIndex = direction === 'prev' ? currentIndex + 1 : currentIndex - 1;

    if (newIndex >= 0 && newIndex < artifactHistory.length) {
      setCurrentArtifact(artifactHistory[newIndex]);
    }
  }, [currentArtifact, artifactHistory]);

  const updateArtifact = useCallback((updates: Partial<Artifact>) => {
    if (!currentArtifact) return;

    const updated = { ...currentArtifact, ...updates };
    setCurrentArtifact(updated);

    // Update in history as well
    setArtifactHistory(prev =>
      prev.map(a => a.id === updated.id ? updated : a)
    );
  }, [currentArtifact]);

  const setPanelWidth = useCallback((width: number) => {
    const maxWidth = (window.innerWidth * MAX_PANEL_WIDTH_PERCENT) / 100;
    const clampedWidth = Math.max(MIN_PANEL_WIDTH, Math.min(width, maxWidth));
    setPanelWidthState(clampedWidth);
  }, []);

  const clearHistory = useCallback(() => {
    setArtifactHistory([]);
  }, []);

  const value: ArtifactsContextType = {
    currentArtifact,
    artifactHistory,
    isOpen,
    panelWidth,
    openArtifact,
    closeArtifact,
    navigateHistory,
    updateArtifact,
    setPanelWidth,
    clearHistory,
  };

  return (
    <ArtifactsContext.Provider value={value}>
      {children}
    </ArtifactsContext.Provider>
  );
};

export const useArtifacts = (): ArtifactsContextType => {
  const context = useContext(ArtifactsContext);
  if (!context) {
    throw new Error('useArtifacts must be used within an ArtifactsProvider');
  }
  return context;
};
