# Tutorial Mode Integration Guide

## Overview
This guide shows how to integrate the new AI Learning System components into the existing TutorialInterface.

## Available Components

### 1. PromptEngineeringLesson
Interactive prompt writing and analysis component.

```tsx
import { PromptEngineeringLesson } from './PromptEngineeringLesson';

// Usage
<PromptEngineeringLesson
  lessonTitle="Writing Effective React Component Prompts"
  description="Learn to communicate component requirements clearly to AI"
  examples={[
    {
      id: '1',
      label: 'Too Vague',
      prompt: 'Make a button',
      quality: 'bad',
      issues: ['No specifications', 'No context', 'No styling requirements'],
    },
    {
      id: '2',
      label: 'Better Prompt',
      prompt: 'Create a React button component with blue background, white text, rounded corners, and a hover effect',
      quality: 'good',
      strengths: ['Specific styling', 'Clear requirements'],
    },
    {
      id: '3',
      label: 'Excellent Prompt',
      prompt: 'Create a reusable React button component with:\n- Props: onClick, disabled, variant (primary/secondary)\n- Primary: bg-blue-500, hover:bg-blue-600\n- Secondary: bg-gray-200, hover:bg-gray-300\n- TypeScript types\n- Accessibility: proper ARIA labels',
      quality: 'excellent',
      strengths: ['Comprehensive specs', 'TypeScript mentioned', 'Accessibility considered', 'Well structured'],
    },
  ]}
  rubric={[
    { name: 'Clarity', description: 'Clear, specific requirements', maxScore: 4 },
    { name: 'Context', description: 'Provides usage context and purpose', maxScore: 4 },
    { name: 'Specificity', description: 'Includes constraints and examples', maxScore: 4 },
    { name: 'Structure', description: 'Well-organized with sections', maxScore: 4 },
  ]}
  onComplete={() => {
    // Update skill proficiency
    updateSkillProficiency('clear_communication', 10);
  }}
/>
```

### 2. DebuggingChallenge
Code debugging exercise with test runner.

```tsx
import { DebuggingChallenge } from './DebuggingChallenge';

// Usage
<DebuggingChallenge
  exercise={{
    id: 'ex-1',
    tutorial_id: 'tutorial-id',
    exercise_type: 'find_bug',
    title: 'Fix the Off-by-One Error',
    instructions: 'This function should sum all numbers in an array, but has a bug. Find and fix it.',
    starter_code: `function sumArray(arr) {
  let sum = 0;
  for (let i = 0; i <= arr.length; i++) {
    sum += arr[i];
  }
  return sum;
}

// Export for testing
export { sumArray };`,
    solution_code: `function sumArray(arr) {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
  }
  return sum;
}

export { sumArray };`,
    test_cases: [
      {
        id: '1',
        input: [1, 2, 3],
        expected_output: 6,
        description: 'Sum of [1,2,3] should be 6',
      },
      {
        id: '2',
        input: [10, 20, 30, 40],
        expected_output: 100,
        description: 'Sum of [10,20,30,40] should be 100',
      },
    ],
    hints: [
      { id: '1', level: 1, text: 'Look at the loop condition carefully' },
      { id: '2', level: 2, text: 'Array indices start at 0 and go to length-1' },
      { id: '3', level: 3, text: 'Change <= to < in the loop condition' },
    ],
    max_attempts: 3,
    sort_order: 0,
    created_at: new Date().toISOString(),
  }}
  onSubmit={async (code, isCorrect, timeSpent, hintsUsed) => {
    await submitExerciseAttempt(exerciseId, {
      submitted_code: code,
      is_correct: isCorrect,
      time_spent_seconds: timeSpent,
      hints_used: hintsUsed,
    });
  }}
  onComplete={() => {
    // Move to next exercise or update skills
    updateSkillProficiency('debugging_ai_code', 5);
  }}
/>
```

### 3. ReactPatternTraining
Pattern recognition training component.

```tsx
import { ReactPatternTraining } from './ReactPatternTraining';

// Usage
<ReactPatternTraining
  patterns={[
    {
      name: 'Custom Hook',
      description: 'Extract stateful logic into reusable functions',
      examples: [
        {
          id: '1',
          code: `function useCounter(initialValue = 0) {
  const [count, setCount] = useState(initialValue);

  const increment = () => setCount(c => c + 1);
  const decrement = () => setCount(c => c - 1);
  const reset = () => setCount(initialValue);

  return { count, increment, decrement, reset };
}`,
          language: 'tsx',
          correctPattern: 'Custom Hook',
          explanation: 'This demonstrates a custom hook pattern that encapsulates counter logic, making it reusable across components.',
          antiPattern: 'Don\'t put hooks inside regular functions or conditionals',
          alternatives: ['useReducer for complex state', 'Zustand for global state'],
        },
      ],
    },
    {
      name: 'Compound Components',
      description: 'Components that work together to form a complete UI',
      examples: [
        {
          id: '2',
          code: `function Tabs({ children }) {
  const [activeTab, setActiveTab] = useState(0);
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </TabsContext.Provider>
  );
}

Tabs.List = function TabsList({ children }) {
  return <div className="flex gap-2">{children}</div>;
};

Tabs.Tab = function Tab({ index, children }) {
  const { activeTab, setActiveTab } = useTabsContext();
  return (
    <button onClick={() => setActiveTab(index)}>
      {children}
    </button>
  );
};`,
          language: 'tsx',
          correctPattern: 'Compound Components',
          explanation: 'Compound components share state through context, creating flexible, composable UI patterns.',
          alternatives: ['Render props', 'Higher-order components'],
        },
      ],
    },
  ]}
  onComplete={() => {
    updateSkillProficiency('react_patterns', 10);
  }}
/>
```

### 4. SkillProgressDashboard
Visual progress tracker across all 7 skills.

```tsx
import { SkillProgressDashboard } from './SkillProgressDashboard';

// Usage
<SkillProgressDashboard
  userId={userId}
  skills={skills}
  achievements={achievements}
  onSkillClick={(skillName) => {
    // Filter tutorials by skill
    const filtered = tutorials.filter(t =>
      t.skill_focus?.includes(skillName)
    );
    // Show filtered tutorials
  }}
/>
```

## Integration with TutorialInterface

### Option 1: Tabbed Interface
Add tabs to switch between tutorial types:

```tsx
export const TutorialInterface: React.FC<TutorialInterfaceProps> = ({
  userId,
  projectId,
}) => {
  const [activeTab, setActiveTab] = useState<'explanation' | 'exercise' | 'progress'>('explanation');
  const { skills, achievements, submitExerciseAttempt, updateSkillProficiency } = useLearningSystem(userId);

  return (
    <div className="chat-container">
      <div className="chat-header">
        {/* Existing header */}
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('explanation')}>Code Explanation</button>
          <button onClick={() => setActiveTab('exercise')}>Exercises</button>
          <button onClick={() => setActiveTab('progress')}>Progress</button>
        </div>
      </div>

      {activeTab === 'explanation' && (
        // Existing tutorial view
      )}

      {activeTab === 'exercise' && (
        // Exercise components
      )}

      {activeTab === 'progress' && (
        <SkillProgressDashboard
          userId={userId}
          skills={skills}
          achievements={achievements}
        />
      )}
    </div>
  );
};
```

### Option 2: Tutorial Type Detection
Automatically show the right component based on tutorial type:

```tsx
// In TutorialInterface
{currentTutorial && (
  <>
    {currentTutorial.tutorial_type === 'explanation' && (
      // Existing step-by-step view
    )}

    {currentTutorial.tutorial_type === 'exercise' && currentTutorial.exercises && (
      <DebuggingChallenge
        exercise={currentTutorial.exercises[0]}
        onSubmit={handleExerciseSubmit}
      />
    )}
  </>
)}
```

### Option 3: Skill-Based Learning Paths
Create guided paths through tutorials:

```tsx
const {
  learningPaths,
  userProgress,
  startLearningPath,
  updateLearningProgress,
} = useLearningSystem(userId);

// Show available paths
{learningPaths.map(path => (
  <button onClick={() => startLearningPath(path.id)}>
    {path.name} - {path.description}
  </button>
))}

// Track progress through path
{currentPath && (
  <div>
    Step {currentPathProgress.current_tutorial_index + 1} of {currentPath.tutorial_sequence.length}
  </div>
)}
```

## Example: Complete Integration

```tsx
import { useState } from 'react';
import { useTutorial } from '../hooks/useTutorial';
import { useLearningSystem } from '../hooks/useLearningSystem';
import { SkillProgressDashboard } from './SkillProgressDashboard';
import { DebuggingChallenge } from './DebuggingChallenge';
import { PromptEngineeringLesson } from './PromptEngineeringLesson';

export const EnhancedTutorialInterface: React.FC<Props> = ({ userId }) => {
  const [view, setView] = useState<'tutorials' | 'exercises' | 'progress'>('tutorials');

  const tutorial = useTutorial(userId);
  const learning = useLearningSystem(userId);

  return (
    <div className="chat-container">
      <div className="chat-header">
        <nav className="flex gap-2">
          <button onClick={() => setView('tutorials')}>Tutorials</button>
          <button onClick={() => setView('exercises')}>Exercises</button>
          <button onClick={() => setView('progress')}>My Progress</button>
        </nav>
      </div>

      <div className="messages-wrapper">
        {view === 'tutorials' && (
          // Existing tutorial interface
          <div>Tutorial content...</div>
        )}

        {view === 'exercises' && (
          <div className="space-y-6">
            {learning.exercises.map(exercise => (
              <DebuggingChallenge
                key={exercise.id}
                exercise={exercise}
                onSubmit={(code, correct, time, hints) =>
                  learning.submitExerciseAttempt(exercise.id, {
                    submitted_code: code,
                    is_correct: correct,
                    time_spent_seconds: time,
                    hints_used: hints,
                  })
                }
              />
            ))}
          </div>
        )}

        {view === 'progress' && (
          <SkillProgressDashboard
            userId={userId}
            skills={learning.skills}
            achievements={learning.achievements}
            onSkillClick={(skill) => {
              // Filter and show relevant tutorials
              console.log('Show tutorials for:', skill);
            }}
          />
        )}
      </div>
    </div>
  );
};
```

## Using the Hook

```tsx
import { useLearningSystem } from '../hooks/useLearningSystem';

function YourComponent({ userId }: { userId: string }) {
  const {
    // State
    skills,              // UserSkill[] - 7 core skills with proficiency 0-100
    categories,          // TutorialCategory[] - Tutorial categories
    achievements,        // UserAchievement[] - Earned badges
    badges,             // AchievementBadge[] - All available badges
    exercises,          // TutorialExercise[] - Current exercises
    promptTemplates,    // PromptTemplate[] - Saved prompts
    learningPaths,      // LearningPath[] - Structured curricula
    userProgress,       // UserLearningProgress[] - Path progress
    isLoading,
    error,

    // Methods
    fetchUserSkills,
    updateSkillProficiency,     // (skill: SkillName, delta: number) => Promise<void>
    fetchCategories,
    fetchAchievements,
    checkAndAwardBadges,       // Automatic badge awarding
    submitExerciseAttempt,     // (exerciseId, attempt) => Promise<void>
    fetchExercises,            // (tutorialId) => Promise<void>
    createPromptTemplate,      // (template) => Promise<string | null>
    fetchPromptTemplates,
    fetchLearningPaths,
    startLearningPath,         // (pathId) => Promise<void>
    updateLearningProgress,    // (pathId, index) => Promise<void>
  } = useLearningSystem(userId);

  // Use in your component...
}
```

## Next Steps

1. **Choose Integration Style**: Decide between tabbed interface, automatic detection, or separate learning mode
2. **Add to Sidebar**: Update Sidebar component to show learning progress
3. **Create Seed Data**: Generate example exercises and prompts
4. **Deploy Edge Function**: Make sure `exercise-generator` is deployed
5. **Test Workflow**: Create a complete user journey from tutorial → exercise → achievement

## Notes

- All components are styled with the existing glass morphism design system
- Components use the same Tailwind classes as the rest of the app
- Animations use Framer Motion (already installed)
- All data persists to Supabase with proper RLS
- Backward compatible with existing tutorial system
