import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ChatSession, StoredFile, SavedSchema, Project } from '../types';
import { User } from '@supabase/supabase-js';

export const useSupabaseData = () => {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [schemas, setSchemas] = useState<SavedSchema[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) {
                console.error('Auth session error:', error);
                setIsLoading(false);
                return;
            }
            if (session?.user) {
                setUser(session.user);
                await fetchProjects(session.user.id);
            }
        } catch (error) {
            console.error('Init error:', error);
        } finally {
            setIsLoading(false);
        }
    };
    init();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
            fetchProjects(session.user.id);
        } else {
            setProjects([]);
            setCurrentProjectId(null);
            setSessions([]);
            setFiles([]);
            setSchemas([]);
        }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  const fetchProjects = async (userId: string) => {
    try {
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (projectError) {
        console.error('Error fetching projects:', projectError);
      } else if (projectData && projectData.length > 0) {
        setProjects(projectData);
        const savedProjectId = localStorage.getItem('currentProjectId');
        const projectId = savedProjectId && projectData.find(p => p.id === savedProjectId)
          ? savedProjectId
          : projectData[0].id;
        setCurrentProjectId(projectId);
        await fetchData(userId, projectId);
      } else if (projectData && projectData.length === 0) {
        const { data: newProject, error: createError } = await supabase
          .from('projects')
          .insert({
            user_id: userId,
            name: 'Default Project',
            description: 'Your first project',
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating default project:', createError);
        } else if (newProject) {
          setProjects([newProject]);
          setCurrentProjectId(newProject.id);
          localStorage.setItem('currentProjectId', newProject.id);
          await fetchData(userId, newProject.id);
        }
      }
    } catch (error) {
      console.error('Error in fetchProjects:', error);
    }
  };

  const fetchData = async (userId: string, projectId: string) => {
    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from('ai_conversations')
        .select('session_id, title, created_at, project_id')
        .eq('user_id', userId)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (sessionError) {
        console.error('Error fetching sessions:', sessionError);
      } else {
        setSessions((sessionData || []).map(s => ({ id: s.session_id, title: s.title, createdAt: s.created_at, project_id: s.project_id })));
      }

      const { data: fileData, error: fileError } = await supabase
        .from('stored_files')
        .select('*')
        .eq('user_id', userId);

      if (fileError) {
        console.error('Error fetching files:', fileError);
      } else {
        setFiles(fileData || []);
      }

      const { data: schemaData, error: schemaError } = await supabase
        .from('saved_schemas')
        .select('*')
        .eq('user_id', userId)
        .eq('project_id', projectId);

      if (schemaError) {
        console.error('Error fetching schemas:', schemaError);
      } else {
        setSchemas(schemaData || []);
      }
    } catch (error) {
      console.error('Error in fetchData:', error);
    }
  };

  const createNewSession = useCallback(async (): Promise<string> => {
    if (!user) throw new Error("User not authenticated");
    if (!currentProjectId) throw new Error("No project selected");
    const newSessionId = crypto.randomUUID();

    const { data, error } = await supabase.from('ai_conversations').insert({
        user_id: user.id,
        session_id: newSessionId,
        title: "New Code Session",
        project_id: currentProjectId,
    }).select().single();

    if (error && error.code !== '23505') {
        console.error("Error creating session:", error);
        return newSessionId;
    }

    if (data) {
        setSessions(prev => [{ id: data.session_id, title: data.title, createdAt: data.created_at, project_id: data.project_id }, ...prev]);
    }

    return newSessionId;
  }, [user, currentProjectId]);

  const saveFile = useCallback(async (file: File) => {
    if (!user) return;

    const content = await file.text();

    const { data } = await supabase
      .from('stored_files')
      .insert({
        user_id: user.id,
        name: file.name,
        content: content,
        mime_type: file.type || 'text/plain',
        size: file.size
      })
      .select()
      .single();

    if (data) {
        setFiles(prev => [...prev, data]);
    }
  }, [user]);

  const deleteFile = useCallback(async (fileId: string) => {
    if (!user) return;
    await supabase.from('stored_files').delete().eq('id', fileId);
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }, [user]);

  const saveSchema = useCallback(async (name: string, content: any, sessionId: string) => {
    if (!user || !currentProjectId) return;

    const jsonContent = typeof content === 'string' ? JSON.parse(content) : content;

    const { data } = await supabase
      .from('saved_schemas')
      .insert({
        user_id: user.id,
        session_id: sessionId,
        project_id: currentProjectId,
        name: name,
        content: jsonContent
      })
      .select()
      .single();

    if (data) {
        setSchemas(prev => [...prev, data]);
    }
  }, [user, currentProjectId]);

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!user) return;
    await supabase.from('ai_conversations').delete().eq('session_id', sessionId).eq('user_id', user.id);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  }, [user]);

  const updateSession = useCallback(async (sessionId: string, title: string) => {
    if (!user) return;
    const { data } = await supabase
      .from('ai_conversations')
      .update({ title })
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (data) {
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title: data.title } : s));
    }
  }, [user]);

  const switchProject = useCallback(async (projectId: string) => {
    if (!user) return;
    setCurrentProjectId(projectId);
    localStorage.setItem('currentProjectId', projectId);
    await fetchData(user.id, projectId);
  }, [user]);

  const createNewProject = useCallback(async (name: string, description: string = ''): Promise<string> => {
    if (!user) throw new Error("User not authenticated");

    const { data, error } = await supabase.from('projects').insert({
        user_id: user.id,
        name,
        description,
    }).select().single();

    if (error) {
        console.error("Error creating project:", error);
        throw error;
    }

    if (data) {
        setProjects(prev => [data, ...prev]);
        setCurrentProjectId(data.id);
        localStorage.setItem('currentProjectId', data.id);
    }

    return data.id;
  }, [user]);

  const updateProject = useCallback(async (projectId: string, name: string, description?: string) => {
    if (!user) return;

    const updateData: { name: string; description?: string; updated_at: string } = {
      name,
      updated_at: new Date().toISOString(),
    };

    if (description !== undefined) {
      updateData.description = description;
    }

    const { data, error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', projectId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating project:", error);
      throw error;
    }

    if (data) {
      setProjects(prev => prev.map(p => p.id === projectId ? data : p));
    }
  }, [user]);

  return {
    user,
    projects,
    currentProjectId,
    sessions,
    files,
    schemas,
    createNewSession,
    deleteSession,
    updateSession,
    saveFile,
    deleteFile,
    saveSchema,
    switchProject,
    createNewProject,
    updateProject,
    isLoading,
  };
};
