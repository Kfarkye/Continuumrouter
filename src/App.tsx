import React, { useState, useEffect, useCallback, Suspense, lazy, useMemo } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { Sidebar } from './components/Sidebar';
import { LandingPage } from './components/LandingPage';
import { useSupabaseData } from './hooks/useSupabaseData';
import { AppState } from './types';
import { Menu, Plus } from 'lucide-react';
import { Spinner } from './components/Spinner';
import { supabase } from './lib/supabaseClient';
import { Session } from '@supabase/supabase-js';
import { ArtifactsProvider } from './contexts/ArtifactsContext';
import { ArtifactsPanel } from './components/ArtifactsPanel';
import { ClinicianSpacesIntroModal } from './components/ClinicianSpacesIntroModal';
import { useOnboardingState } from './hooks/useOnboardingState';

// Performance: Lazy load main interfaces
const ChatInterface = lazy(() => import('./components/ChatInterface'));
const DeepThinkInterface = lazy(() => import('./components/DeepThinkInterface').then(module => ({ default: module.DeepThinkInterface })));
const TutorialInterface = lazy(() => import('./components/TutorialInterface').then(module => ({ default: module.TutorialInterface })));
const RecruiterDashboard = lazy(() => import('./components/RecruiterDashboard').then(module => ({ default: module.RecruiterDashboard })));
const ReplyAssistantInterface = lazy(() => import('./components/ReplyAssistantInterface').then(module => ({ default: module.ReplyAssistantInterface })));

// Loading Spinner Component
const LoadingSpinner: React.FC<{ message?: string, fullScreen?: boolean }> = ({ message = "Loading...", fullScreen = false }) => {
    const containerClass = fullScreen
      ? "flex h-screen w-screen items-center justify-center bg-black text-white"
      : "flex h-full w-full items-center justify-center bg-black text-white";

    return (
      <div className={containerClass}>
        <div className="flex items-center space-x-3">
          <Spinner size="lg" color="white" />
          <p className="text-sm text-white/70">{message}</p>
        </div>
      </div>
    );
  };

const App: React.FC = () => {
  // Authentication State
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Application State
  const [appState, setAppState] = useState<AppState>({
    currentSessionId: null,
    sidebarOpen: false,
    mode: 'chat',
  });

  // Sidebar Collapse State (for desktop)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Data from Supabase
  const {
    projects,
    currentProjectId,
    sessions,
    files,
    isLoading: isDataLoading,
    createNewSession,
    deleteSession,
    updateSession,
    saveSchema,
    switchProject,
    createNewProject,
    updateProject,
  } = useSupabaseData();

  // Onboarding state for clinician spaces intro
  const {
    hasSeenClinicianSpacesIntro,
    markClinicianSpacesIntroSeen,
  } = useOnboardingState(session?.user?.id);

  // Track clinician spaces
  const clinicianProjects = useMemo(() => {
    return projects.filter(p => p.clinician_id != null);
  }, [projects]);

  const shouldShowClinicianIntro = !hasSeenClinicianSpacesIntro && clinicianProjects.length > 0;
  const [showClinicianIntro, setShowClinicianIntro] = useState(false);

  // DISABLED: Intro modal was interrupting workflow
  // Show intro modal when clinician spaces are detected
  // useEffect(() => {
  //   if (shouldShowClinicianIntro && !isDataLoading && session) {
  //     // Small delay to let the UI settle
  //     const timer = setTimeout(() => {
  //       setShowClinicianIntro(true);
  //     }, 500);
  //     return () => clearTimeout(timer);
  //   }
  // }, [shouldShowClinicianIntro, isDataLoading, session]);

  // Check authentication on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Handlers
  const toggleSidebar = useCallback(() => {
    setAppState(prev => ({ ...prev, sidebarOpen: !prev.sidebarOpen }));
  }, []);

  const toggleSidebarCollapse = useCallback(() => {
    setIsSidebarCollapsed(prev => !prev);
  }, []);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    toast.success('Signed out successfully');
  }, []);

  const handleModeChange = useCallback((mode: 'chat' | 'deepthink' | 'tutorial' | 'dashboard' | 'reply_assistant') => {
    setAppState(prev => ({ ...prev, mode }));
  }, []);

  const navigateToDeepThink = useCallback(() => {
    handleModeChange('deepthink');
  }, [handleModeChange]);

  const navigateToTutorial = useCallback(() => {
    handleModeChange('tutorial');
  }, [handleModeChange]);

  const navigateToDashboard = useCallback(() => {
    handleModeChange('dashboard');
  }, [handleModeChange]);

  const navigateToReplyAssistant = useCallback(() => {
    handleModeChange('reply_assistant');
  }, [handleModeChange]);

  // Sidebar Props
  const sidebarProps = useMemo(() => ({
    spaces: projects,
    currentSpaceId: currentProjectId,
    onSpaceSwitch: switchProject,
    onSpaceCreate: createNewProject,
    onSpaceUpdate: updateProject,
    onSpaceDelete: async (projectId: string) => {
      console.log('Delete project:', projectId);
    },
    sessions,
    selectedSessionId: appState.currentSessionId,
    onSessionSelect: (sessionId: string) => {
      setAppState(prev => ({ ...prev, currentSessionId: sessionId, mode: 'chat' }));
      if (window.innerWidth < 768) {
        setAppState(prev => ({ ...prev, sidebarOpen: false }));
      }
    },
    onSessionCreate: async () => {
      const newSessionId = await createNewSession();
      setAppState(prev => ({ ...prev, currentSessionId: newSessionId, mode: 'chat' }));
    },
    onSessionDelete: deleteSession,
    onSessionUpdate: updateSession,
    onSignOut: handleSignOut,
    activeSection: appState.mode === 'deepthink' ? 'research' : appState.mode === 'tutorial' ? 'build_mode' : appState.mode === 'dashboard' ? 'dashboard' : appState.mode === 'reply_assistant' ? 'reply_assistant' : 'conversations',
    onNavigateToDeepThink: navigateToDeepThink,
    onNavigateToTutorial: navigateToTutorial,
    onNavigateToDashboard: navigateToDashboard,
    onNavigate: (section) => {
      if (section === 'reply_assistant') navigateToReplyAssistant();
      else if (section === 'dashboard') navigateToDashboard();
      else if (section === 'research') navigateToDeepThink();
      else if (section === 'build_mode') navigateToTutorial();
    },
    userId: session?.user?.id,
    isSidebarCollapsed,
    onToggleSidebar: toggleSidebarCollapse,
    isMobileOpen: appState.sidebarOpen,
    onMobileClose: () => setAppState(prev => ({ ...prev, sidebarOpen: false })),
  }), [
    projects,
    currentProjectId,
    sessions,
    appState.currentSessionId,
    appState.mode,
    appState.sidebarOpen,
    isSidebarCollapsed,
    session?.user?.id,
    switchProject,
    createNewProject,
    updateProject,
    createNewSession,
    deleteSession,
    updateSession,
    handleSignOut,
    navigateToDeepThink,
    navigateToTutorial,
    navigateToDashboard,
    toggleSidebarCollapse,
  ]);

  // Show landing page if not authenticated
  if (isAuthLoading) {
    return <LoadingSpinner message="Loading..." fullScreen />;
  }

  if (!session) {
    return <LandingPage />;
  }

  const handleClinicianIntroClose = () => {
    setShowClinicianIntro(false);
    markClinicianSpacesIntroSeen();
  };

  const handleClinicianIntroGetStarted = () => {
    if (clinicianProjects.length > 0) {
      switchProject(clinicianProjects[0].id);
      if (appState.mode !== 'chat') {
        setAppState(prev => ({ ...prev, mode: 'chat' }));
      }
      toast.success('Opened your first clinician space!');
    }
  };

  // Main Application Layout (Responsive)
  return (
    <ArtifactsProvider>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            // Apple-inspired subtle glassmorphism for toasts
            background: 'rgba(28, 28, 30, 0.8)', // A slightly more nuanced dark gray
            color: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(20px) saturate(180%)',
            fontSize: '14px',
            borderRadius: '12px', // Softer corners
          },
        }}
      />

      {/* Clinician Spaces Intro Modal */}
      <ClinicianSpacesIntroModal
        isOpen={showClinicianIntro}
        onClose={handleClinicianIntroClose}
        clinicianCount={clinicianProjects.length}
        onGetStarted={handleClinicianIntroGetStarted}
      />

      {/* Global container with system font and bg-black */}
      <div className="h-screen w-screen flex overflow-hidden bg-black" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, \'SF Pro Display\', \'SF Pro Text\', \'Helvetica Neue\', Helvetica, Arial, sans-serif' }}>

        {/* Mobile Sidebar Backdrop (Overlay) */}
        {appState.sidebarOpen && (
            <div
                className="md:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-20"
                onClick={toggleSidebar}
                aria-hidden="true"
            />
        )}

        {/* Sidebar Container - Responsive */}
        {/* We let the Sidebar component manage its own width on desktop (md:w-auto) */}
        <div className={`
            fixed md:relative z-30 h-full transition-transform duration-300 ease-in-out
            ${appState.sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            md:translate-x-0
            w-72 md:w-auto flex-shrink-0
            border-r border-white/[0.04]
            bg-black
        `}>
          <Sidebar {...sidebarProps} />
        </div>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col relative min-w-0 overflow-hidden">

            {/* Mobile Header with iOS Safe Area Support */}
            <div className="md:hidden sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-black/90 backdrop-blur-md border-b border-white/[0.04]" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
               <button
                  onClick={toggleSidebar}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-white/[0.05] rounded-xl transition-colors active:scale-95"
                  aria-label="Toggle Sidebar"
               >
                  <Menu className="w-6 h-6 text-white/70" />
               </button>
               <div className="flex items-center gap-2">
                  <h1 className="text-base font-semibold text-white">
                     {appState.mode === 'deepthink' ? 'DeepThink' : appState.mode === 'tutorial' ? 'Tutorial Mode' : appState.mode === 'dashboard' ? 'Dashboard' : appState.mode === 'reply_assistant' ? 'Reply Assistant' : 'Continuum'}
                  </h1>
               </div>
               <button
                  onClick={async () => {
                     const newSessionId = await createNewSession();
                     setAppState(prev => ({ ...prev, currentSessionId: newSessionId, mode: 'chat' }));
                  }}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-blue-500/10 hover:text-blue-400 rounded-xl transition-colors active:scale-95"
                  aria-label="New Chat"
               >
                  <Plus className="w-6 h-6 text-white/70" />
               </button>
            </div>

            {/* Content Interfaces */}
            <div className="flex-1 overflow-y-auto">
                <Suspense fallback={<LoadingSpinner message="Loading interface..." />}>
                    {isDataLoading ? (
                       <LoadingSpinner message="Loading your data..." />
                    ) : appState.mode === 'reply_assistant' ? (
                       <div className="h-full overflow-y-auto">
                          <ReplyAssistantInterface userId={session.user.id} />
                       </div>
                    ) : appState.mode === 'dashboard' ? (
                       <div className="h-full overflow-y-auto p-6">
                          <RecruiterDashboard />
                       </div>
                    ) : appState.mode === 'deepthink' ? (
                       <DeepThinkInterface userId={session.user.id} />
                    ) : appState.mode === 'tutorial' ? (
                       <TutorialInterface userId={session.user.id} projectId={currentProjectId} />
                    ) : appState.currentSessionId && sessions.find(s => s.id === appState.currentSessionId) ? (
                       <ChatInterface
                          sessionId={appState.currentSessionId}
                          sessionName={sessions.find(s => s.id === appState.currentSessionId)!.title}
                          files={files}
                          onSaveSchema={saveSchema}
                          onDeleteSession={deleteSession}
                          accessToken={session.access_token}
                          userId={session.user.id}
                       />
                    ) : (
                       // Welcome Screen
                       <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                          <h2 className="text-2xl font-semibold text-white mb-6">
                             Welcome to Continuum
                          </h2>
                          <p className="text-white/60 mb-8 max-w-md">
                             Start a new conversation or select an existing one from the sidebar.
                          </p>
                          <button
                             onClick={async () => {
                                const newSessionId = await createNewSession();
                                setAppState(prev => ({ ...prev, currentSessionId: newSessionId, mode: 'chat' }));
                             }}
                             className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30"
                          >
                             <Plus className="w-4 h-4" />
                             Start New Conversation
                          </button>
                       </div>
                    )}
                </Suspense>
            </div>
        </main>

        {/* Artifacts Panel */}
        <ArtifactsPanel />
      </div>
    </ArtifactsProvider>
  );
};

export default App;