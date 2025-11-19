import { useState } from 'react';
import { TrendingUp, Award, Target, BookOpen, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import type { UserSkill, SkillName, UserAchievement } from '../types';

interface SkillProgressDashboardProps {
  userId: string;
  skills: UserSkill[];
  achievements: UserAchievement[];
  onSkillClick?: (skillName: SkillName) => void;
}

const SKILL_LABELS: Record<SkillName, string> = {
  clear_communication: 'Clear Communication',
  debugging_ai_code: 'Debugging AI Code',
  prompt_iteration: 'Prompt Iteration',
  react_patterns: 'React Patterns',
  system_integration: 'System Integration',
  code_reading: 'Code Reading',
  ai_fundamentals: 'AI Fundamentals',
};

const SKILL_DESCRIPTIONS: Record<SkillName, string> = {
  clear_communication: 'Articulate requirements clearly to AI assistants',
  debugging_ai_code: 'Identify and fix issues in AI-generated code',
  prompt_iteration: 'Refine prompts through multiple iterations',
  react_patterns: 'Master React hooks, patterns, and best practices',
  system_integration: 'Connect APIs, databases, and components',
  code_reading: 'Quickly understand existing codebases',
  ai_fundamentals: 'Core concepts to guide AI development',
};

export const SkillProgressDashboard: React.FC<SkillProgressDashboardProps> = ({
  skills,
  achievements,
  onSkillClick,
}) => {
  const [selectedSkill, setSelectedSkill] = useState<SkillName | null>(null);

  const averageProficiency = skills.length > 0
    ? Math.round(skills.reduce((sum, s) => sum + s.proficiency_level, 0) / skills.length)
    : 0;

  const totalTutorials = skills.reduce((sum, s) => sum + s.tutorials_completed, 0);
  const totalExercises = skills.reduce((sum, s) => sum + s.exercises_passed, 0);

  const radarPoints = skills
    .sort((a, b) => {
      const orderA = Object.keys(SKILL_LABELS).indexOf(a.skill_name);
      const orderB = Object.keys(SKILL_LABELS).indexOf(b.skill_name);
      return orderA - orderB;
    })
    .map((skill, index, array) => {
      const angle = (index / array.length) * 2 * Math.PI - Math.PI / 2;
      const radius = 100;
      const value = (skill.proficiency_level / 100) * radius;
      return {
        x: 150 + value * Math.cos(angle),
        y: 150 + value * Math.sin(angle),
        label: SKILL_LABELS[skill.skill_name],
        proficiency: skill.proficiency_level,
        skillName: skill.skill_name,
      };
    });

  const radarPath = radarPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  const getProficiencyColor = (level: number) => {
    if (level >= 80) return 'text-green-400';
    if (level >= 60) return 'text-blue-400';
    if (level >= 40) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getProficiencyLabel = (level: number) => {
    if (level >= 80) return 'Expert';
    if (level >= 60) return 'Proficient';
    if (level >= 40) return 'Developing';
    return 'Beginner';
  };

  const recentAchievements = achievements
    .sort((a, b) => new Date(b.earned_at).getTime() - new Date(a.earned_at).getTime())
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-heavy rounded-xl p-4 border border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-500/20">
              <TrendingUp className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{averageProficiency}%</p>
              <p className="text-xs text-white/60">Avg Proficiency</p>
            </div>
          </div>
        </div>

        <div className="glass-heavy rounded-xl p-4 border border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-green-500/20">
              <BookOpen className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{totalTutorials}</p>
              <p className="text-xs text-white/60">Tutorials Done</p>
            </div>
          </div>
        </div>

        <div className="glass-heavy rounded-xl p-4 border border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-purple-500/20">
              <CheckCircle className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{totalExercises}</p>
              <p className="text-xs text-white/60">Exercises Passed</p>
            </div>
          </div>
        </div>

        <div className="glass-heavy rounded-xl p-4 border border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-yellow-500/20">
              <Award className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{achievements.length}</p>
              <p className="text-xs text-white/60">Badges Earned</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="glass-heavy rounded-xl p-6 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-4">Skill Radar</h3>

          <div className="relative">
            <svg width="300" height="300" viewBox="0 0 300 300" className="mx-auto">
              <defs>
                <radialGradient id="radarGradient">
                  <stop offset="0%" stopColor="rgba(59, 130, 246, 0.3)" />
                  <stop offset="100%" stopColor="rgba(59, 130, 246, 0)" />
                </radialGradient>
              </defs>

              {[20, 40, 60, 80, 100].map((level) => (
                <circle
                  key={level}
                  cx="150"
                  cy="150"
                  r={level}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.1)"
                  strokeWidth="1"
                />
              ))}

              {radarPoints.map((point, index) => (
                <line
                  key={index}
                  x1="150"
                  y1="150"
                  x2={150 + 100 * Math.cos((index / radarPoints.length) * 2 * Math.PI - Math.PI / 2)}
                  y2={150 + 100 * Math.sin((index / radarPoints.length) * 2 * Math.PI - Math.PI / 2)}
                  stroke="rgba(255, 255, 255, 0.1)"
                  strokeWidth="1"
                />
              ))}

              <motion.path
                d={radarPath}
                fill="url(#radarGradient)"
                stroke="rgb(59, 130, 246)"
                strokeWidth="2"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              />

              {radarPoints.map((_, index) => (
                <g key={index}>
                  <motion.circle
                    cx={radarPoints[index].x}
                    cy={radarPoints[index].y}
                    r="4"
                    fill="rgb(59, 130, 246)"
                    stroke="white"
                    strokeWidth="2"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: index * 0.1, duration: 0.3 }}
                    className="cursor-pointer hover:fill-blue-300"
                    onClick={() => {
                      setSelectedSkill(radarPoints[index].skillName);
                      onSkillClick?.(radarPoints[index].skillName);
                    }}
                  />
                  <text
                    x={150 + 115 * Math.cos((index / radarPoints.length) * 2 * Math.PI - Math.PI / 2)}
                    y={150 + 115 * Math.sin((index / radarPoints.length) * 2 * Math.PI - Math.PI / 2)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-white/80 text-xs font-medium pointer-events-none"
                  >
                    {radarPoints[index].proficiency}%
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <div className="mt-4 space-y-1">
            {radarPoints.map((point, index) => (
              <button
                key={index}
                onClick={() => {
                  setSelectedSkill(point.skillName);
                  onSkillClick?.(point.skillName);
                }}
                className={cn(
                  'w-full flex items-center justify-between p-2 rounded-lg transition-all text-left',
                  selectedSkill === point.skillName
                    ? 'bg-blue-500/20 border border-blue-500/30'
                    : 'hover:bg-white/5'
                )}
              >
                <span className="text-xs text-white/80">{point.label}</span>
                <span className={cn('text-xs font-medium', getProficiencyColor(point.proficiency))}>
                  {getProficiencyLabel(point.proficiency)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-heavy rounded-xl p-6 border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-400" />
              Skill Details
            </h3>

            <div className="space-y-4">
              {skills
                .sort((a, b) => b.proficiency_level - a.proficiency_level)
                .map((skill) => (
                  <div
                    key={skill.id}
                    className={cn(
                      'p-3 rounded-lg border transition-all cursor-pointer',
                      selectedSkill === skill.skill_name
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    )}
                    onClick={() => {
                      setSelectedSkill(skill.skill_name);
                      onSkillClick?.(skill.skill_name);
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-white">
                          {SKILL_LABELS[skill.skill_name]}
                        </h4>
                        <p className="text-xs text-white/60 mt-1">
                          {SKILL_DESCRIPTIONS[skill.skill_name]}
                        </p>
                      </div>
                      <span className={cn(
                        'text-lg font-bold ml-3',
                        getProficiencyColor(skill.proficiency_level)
                      )}>
                        {skill.proficiency_level}%
                      </span>
                    </div>

                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-2">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${skill.proficiency_level}%` }}
                        transition={{ duration: 0.5 }}
                        className={cn(
                          'h-full rounded-full',
                          skill.proficiency_level >= 80 ? 'bg-green-500' :
                          skill.proficiency_level >= 60 ? 'bg-blue-500' :
                          skill.proficiency_level >= 40 ? 'bg-yellow-500' :
                          'bg-red-500'
                        )}
                      />
                    </div>

                    <div className="flex items-center gap-4 text-xs text-white/60">
                      <span>{skill.tutorials_completed} tutorials</span>
                      <span>{skill.exercises_passed} exercises</span>
                      <span className="ml-auto">
                        {new Date(skill.last_practiced_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {recentAchievements.length > 0 && (
            <div className="glass-heavy rounded-xl p-6 border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Award className="w-5 h-5 text-yellow-400" />
                Recent Achievements
              </h3>

              <div className="space-y-3">
                {recentAchievements.map((achievement) => (
                  <motion.div
                    key={achievement.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-3 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-yellow-500/20 flex-shrink-0">
                      <Award className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-white">
                        {achievement.badge?.name || 'Achievement'}
                      </h4>
                      <p className="text-xs text-white/60 mt-1">
                        {achievement.badge?.description}
                      </p>
                      <p className="text-xs text-white/40 mt-2">
                        {new Date(achievement.earned_at).toLocaleDateString()}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
