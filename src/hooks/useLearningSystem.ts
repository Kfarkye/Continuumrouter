import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import type {
  UserSkill,
  SkillName,
  TutorialCategory,
  UserAchievement,
  AchievementBadge,
  TutorialExercise,
  UserExerciseAttempt,
  PromptTemplate,
  LearningPath,
  UserLearningProgress,
} from '../types';

export interface UseLearningSystemReturn {
  skills: UserSkill[];
  categories: TutorialCategory[];
  achievements: UserAchievement[];
  badges: AchievementBadge[];
  exercises: TutorialExercise[];
  promptTemplates: PromptTemplate[];
  learningPaths: LearningPath[];
  userProgress: UserLearningProgress[];
  isLoading: boolean;
  error: string | null;

  fetchUserSkills: () => Promise<void>;
  updateSkillProficiency: (skillName: SkillName, delta: number) => Promise<void>;
  fetchCategories: () => Promise<void>;
  fetchAchievements: () => Promise<void>;
  checkAndAwardBadges: () => Promise<void>;
  submitExerciseAttempt: (exerciseId: string, attempt: Partial<UserExerciseAttempt>) => Promise<void>;
  fetchExercises: (tutorialId: string) => Promise<void>;
  createPromptTemplate: (template: Partial<PromptTemplate>) => Promise<string | null>;
  fetchPromptTemplates: () => Promise<void>;
  fetchLearningPaths: () => Promise<void>;
  startLearningPath: (pathId: string) => Promise<void>;
  updateLearningProgress: (pathId: string, tutorialIndex: number) => Promise<void>;
}

export function useLearningSystem(userId: string): UseLearningSystemReturn {
  const [skills, setSkills] = useState<UserSkill[]>([]);
  const [categories, setCategories] = useState<TutorialCategory[]>([]);
  const [achievements, setAchievements] = useState<UserAchievement[]>([]);
  const [badges, setBadges] = useState<AchievementBadge[]>([]);
  const [exercises, setExercises] = useState<TutorialExercise[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [learningPaths, setLearningPaths] = useState<LearningPath[]>([]);
  const [userProgress, setUserProgress] = useState<UserLearningProgress[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initializeUserSkills = useCallback(async () => {
    const skillNames: SkillName[] = [
      'clear_communication',
      'debugging_ai_code',
      'prompt_iteration',
      'react_patterns',
      'system_integration',
      'code_reading',
      'ai_fundamentals',
    ];

    const { data: existingSkills } = await supabase
      .from('user_skills')
      .select('skill_name')
      .eq('user_id', userId);

    const existingSkillNames = new Set(existingSkills?.map(s => s.skill_name) || []);
    const missingSkills = skillNames.filter(name => !existingSkillNames.has(name));

    if (missingSkills.length > 0) {
      await supabase
        .from('user_skills')
        .insert(
          missingSkills.map(skill_name => ({
            user_id: userId,
            skill_name,
            proficiency_level: 0,
          }))
        );
    }
  }, [userId]);

  const fetchUserSkills = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      await initializeUserSkills();

      const { data, error } = await supabase
        .from('user_skills')
        .select('*')
        .eq('user_id', userId)
        .order('proficiency_level', { ascending: false });

      if (error) throw error;
      setSkills(data || []);
    } catch (err) {
      console.error('Error fetching user skills:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch skills');
    } finally {
      setIsLoading(false);
    }
  }, [userId, initializeUserSkills]);

  const updateSkillProficiency = useCallback(async (skillName: SkillName, delta: number) => {
    try {
      const skill = skills.find(s => s.skill_name === skillName);
      if (!skill) return;

      const newProficiency = Math.max(0, Math.min(100, skill.proficiency_level + delta));

      const { error } = await supabase
        .from('user_skills')
        .update({
          proficiency_level: newProficiency,
          last_practiced_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('skill_name', skillName);

      if (error) throw error;

      setSkills(prev =>
        prev.map(s =>
          s.skill_name === skillName
            ? { ...s, proficiency_level: newProficiency, last_practiced_at: new Date().toISOString() }
            : s
        )
      );

      await checkAndAwardBadges();
    } catch (err) {
      console.error('Error updating skill proficiency:', err);
    }
  }, [userId, skills]);

  const fetchCategories = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('tutorial_categories')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setCategories(data || []);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  }, []);

  const fetchAchievements = useCallback(async () => {
    try {
      const { data: userAchievements, error: achievementsError } = await supabase
        .from('user_achievements')
        .select('*, badge:achievement_badges(*)')
        .eq('user_id', userId)
        .order('earned_at', { ascending: false });

      if (achievementsError) throw achievementsError;

      const { data: allBadges, error: badgesError } = await supabase
        .from('achievement_badges')
        .select('*')
        .order('created_at', { ascending: false });

      if (badgesError) throw badgesError;

      setAchievements(userAchievements || []);
      setBadges(allBadges || []);
    } catch (err) {
      console.error('Error fetching achievements:', err);
    }
  }, [userId]);

  const checkAndAwardBadges = useCallback(async () => {
    try {
      const { data: userAchievementIds } = await supabase
        .from('user_achievements')
        .select('badge_id')
        .eq('user_id', userId);

      const earnedBadgeIds = new Set(userAchievementIds?.map(a => a.badge_id) || []);

      const { data: allBadges } = await supabase
        .from('achievement_badges')
        .select('*');

      if (!allBadges) return;

      const userStats = {
        tutorials_completed: skills.reduce((sum, s) => sum + s.tutorials_completed, 0),
        exercises_passed: skills.reduce((sum, s) => sum + s.exercises_passed, 0),
        all_skills_proficiency: Math.min(...skills.map(s => s.proficiency_level)),
      };

      for (const badge of allBadges) {
        if (earnedBadgeIds.has(badge.id)) continue;

        let shouldAward = false;
        const criteria = badge.unlock_criteria as Record<string, number | string>;

        if (criteria.tutorials_completed && userStats.tutorials_completed >= Number(criteria.tutorials_completed)) {
          shouldAward = true;
        }

        if (criteria.all_skills_proficiency && userStats.all_skills_proficiency >= Number(criteria.all_skills_proficiency)) {
          shouldAward = true;
        }

        if (shouldAward) {
          await supabase
            .from('user_achievements')
            .insert({
              user_id: userId,
              badge_id: badge.id,
              progress_snapshot: userStats,
            });
        }
      }

      await fetchAchievements();
    } catch (err) {
      console.error('Error checking badges:', err);
    }
  }, [userId, skills, fetchAchievements]);

  const submitExerciseAttempt = useCallback(async (
    exerciseId: string,
    attempt: Partial<UserExerciseAttempt>
  ) => {
    try {
      const { data: previousAttempts } = await supabase
        .from('user_exercise_attempts')
        .select('attempt_number')
        .eq('user_id', userId)
        .eq('exercise_id', exerciseId)
        .order('attempt_number', { ascending: false })
        .limit(1);

      const attemptNumber = (previousAttempts?.[0]?.attempt_number || 0) + 1;

      const { error } = await supabase
        .from('user_exercise_attempts')
        .insert({
          user_id: userId,
          exercise_id: exerciseId,
          attempt_number: attemptNumber,
          ...attempt,
        });

      if (error) throw error;

      if (attempt.is_correct) {
        const { data: exercise } = await supabase
          .from('tutorial_exercises')
          .select('tutorial_id')
          .eq('id', exerciseId)
          .single();

        if (exercise) {
          const { data: tutorial } = await supabase
            .from('tutorials')
            .select('skill_focus')
            .eq('id', exercise.tutorial_id)
            .single();

          if (tutorial?.skill_focus) {
            const skillFocus = tutorial.skill_focus as SkillName[];
            for (const skillName of skillFocus) {
              await updateSkillProficiency(skillName, 5);

              await supabase
                .from('user_skills')
                .update({
                  exercises_passed: supabase.raw('exercises_passed + 1'),
                })
                .eq('user_id', userId)
                .eq('skill_name', skillName);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error submitting exercise attempt:', err);
      throw err;
    }
  }, [userId, updateSkillProficiency]);

  const fetchExercises = useCallback(async (tutorialId: string) => {
    try {
      const { data, error } = await supabase
        .from('tutorial_exercises')
        .select('*')
        .eq('tutorial_id', tutorialId)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setExercises(data || []);
    } catch (err) {
      console.error('Error fetching exercises:', err);
    }
  }, []);

  const createPromptTemplate = useCallback(async (
    template: Partial<PromptTemplate>
  ): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from('prompt_templates')
        .insert({
          user_id: userId,
          ...template,
        })
        .select()
        .single();

      if (error) throw error;
      await fetchPromptTemplates();
      return data.id;
    } catch (err) {
      console.error('Error creating prompt template:', err);
      return null;
    }
  }, [userId]);

  const fetchPromptTemplates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('prompt_templates')
        .select('*')
        .or(`is_public.eq.true,user_id.eq.${userId}`)
        .order('effectiveness_rating', { ascending: false });

      if (error) throw error;
      setPromptTemplates(data || []);
    } catch (err) {
      console.error('Error fetching prompt templates:', err);
    }
  }, [userId]);

  const fetchLearningPaths = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('learning_paths')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setLearningPaths(data || []);
    } catch (err) {
      console.error('Error fetching learning paths:', err);
    }
  }, []);

  const startLearningPath = useCallback(async (pathId: string) => {
    try {
      const { data: existing } = await supabase
        .from('user_learning_progress')
        .select('id')
        .eq('user_id', userId)
        .eq('learning_path_id', pathId)
        .single();

      if (existing) {
        await supabase
          .from('user_learning_progress')
          .update({
            last_activity_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('user_learning_progress')
          .insert({
            user_id: userId,
            learning_path_id: pathId,
            current_tutorial_index: 0,
          });
      }

      const { data, error } = await supabase
        .from('user_learning_progress')
        .select('*, learning_path:learning_paths(*)')
        .eq('user_id', userId);

      if (error) throw error;
      setUserProgress(data || []);
    } catch (err) {
      console.error('Error starting learning path:', err);
    }
  }, [userId]);

  const updateLearningProgress = useCallback(async (pathId: string, tutorialIndex: number) => {
    try {
      const { data: progress } = await supabase
        .from('user_learning_progress')
        .select('*, learning_path:learning_paths(*)')
        .eq('user_id', userId)
        .eq('learning_path_id', pathId)
        .single();

      if (!progress) return;

      const learningPath = progress.learning_path as LearningPath;
      const isComplete = tutorialIndex >= (learningPath.tutorial_sequence as string[]).length - 1;

      await supabase
        .from('user_learning_progress')
        .update({
          current_tutorial_index: tutorialIndex,
          last_activity_at: new Date().toISOString(),
          completed_at: isComplete ? new Date().toISOString() : null,
        })
        .eq('user_id', userId)
        .eq('learning_path_id', pathId);

      const { data, error } = await supabase
        .from('user_learning_progress')
        .select('*, learning_path:learning_paths(*)')
        .eq('user_id', userId);

      if (error) throw error;
      setUserProgress(data || []);
    } catch (err) {
      console.error('Error updating learning progress:', err);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchUserSkills();
      fetchCategories();
      fetchAchievements();
      fetchPromptTemplates();
      fetchLearningPaths();
    }
  }, [userId, fetchUserSkills, fetchCategories, fetchAchievements, fetchPromptTemplates, fetchLearningPaths]);

  return {
    skills,
    categories,
    achievements,
    badges,
    exercises,
    promptTemplates,
    learningPaths,
    userProgress,
    isLoading,
    error,
    fetchUserSkills,
    updateSkillProficiency,
    fetchCategories,
    fetchAchievements,
    checkAndAwardBadges,
    submitExerciseAttempt,
    fetchExercises,
    createPromptTemplate,
    fetchPromptTemplates,
    fetchLearningPaths,
    startLearningPath,
    updateLearningProgress,
  };
}
