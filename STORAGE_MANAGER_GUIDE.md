# Enhanced Storage Manager Guide

## Overview

The Storage Manager has been upgraded with intelligent TypeScript snippet parsing, automatic organization, and paste-ready functionality.

## Key Features

### 1. **Quick Add Snippet**
Click the "Quick Add" button to open an intelligent snippet parser that:
- Automatically detects snippet type (component, hook, utility, interface, etc.)
- Extracts imports and dependencies
- Generates relevant tags
- Suggests a name based on code analysis
- Cleans up code formatting

### 2. **Intelligent Parsing**
When you paste TypeScript code, the system automatically:
- Detects if it's a React component, custom hook, utility function, type, interface, or class
- Extracts all import statements
- Identifies external dependencies
- Generates contextual tags (react, typescript, async, api, etc.)
- Removes markdown code fences and cleans formatting

### 3. **Paste-Ready Output**
When you copy a snippet:
- All imports are automatically included at the top
- Code is properly formatted and ready to paste
- No manual cleanup needed

### 4. **Smart Organization**
Snippets are automatically categorized by:
- **Component**: React functional or class components
- **Hook**: Custom React hooks (functions starting with `use`)
- **Utility**: Helper functions and utilities
- **Type/Interface**: TypeScript type definitions
- **Function**: Standalone functions
- **Class**: ES6 classes
- **Constant**: Constants and configuration objects

## How to Use

### Adding a Snippet

1. Click the **"Quick Add"** button in the Storage Manager
2. Paste your TypeScript code (from anywhere - GitHub, docs, your editor)
3. Review the auto-detected information:
   - Snippet name (editable)
   - Type detection
   - Dependencies
   - Tags
4. Click **"Save Snippet"**

### Copying a Snippet

1. Find your snippet in the list
2. Click the copy icon
3. **All imports are automatically included** - just paste and go!

### Example Workflow

```typescript
// You paste this in Quick Add:
export const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

// System detects:
// - Type: hook
// - Name: useDebounce
// - Dependencies: react
// - Tags: hook, react, typescript

// When you copy it later, you get:
import { useState, useEffect } from 'react';

export const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};
```

## Supported Code Patterns

### React Components
```typescript
export const MyComponent: React.FC<Props> = ({ children }) => {
  return <div>{children}</div>;
};
```

### Custom Hooks
```typescript
export function useMyHook(param: string) {
  const [state, setState] = useState(param);
  return state;
}
```

### Utility Functions
```typescript
export const formatDate = (date: Date): string => {
  return date.toISOString();
};
```

### Type Definitions
```typescript
export interface User {
  id: string;
  name: string;
  email: string;
}
```

### Classes
```typescript
export class ApiClient {
  constructor(private baseURL: string) {}
  async fetch(endpoint: string) {
    return fetch(\`\${this.baseURL}/\${endpoint}\`);
  }
}
```

## Auto-Generated Tags

The system automatically tags snippets based on content:
- `react` - React imports detected
- `typescript` - TypeScript syntax
- `async` - Async/await or Promises
- `api` - API or fetch calls
- `hooks` - React hooks usage
- `forms` - Form libraries
- `validation` - Validation libraries
- `animation` - Animation libraries
- `jsx` - JSX syntax detected

## Benefits

1. **No Manual Organization** - Everything is automatically categorized
2. **Copy-Paste Ready** - Imports included automatically
3. **Save Anything** - Works with any TypeScript/JavaScript code
4. **Smart Detection** - Understands your code structure
5. **Quick Access** - Search and filter to find snippets fast

## Tips

- Paste code directly from GitHub, docs, or your editor
- Let the system detect the name and type automatically
- Use the search to quickly find snippets
- Copy button gives you paste-ready code with all imports
- Export your entire library as JSON for backup
- Import snippets from other projects

## Technical Details

### Parser Features
- Regex-based pattern matching for code structure
- Import statement extraction
- Dependency resolution (npm packages vs local imports)
- JSDoc comment extraction
- Export statement analysis
- Code cleanup (removes markdown fences, 'use client' directives)

### Storage
- Hybrid mode: Local storage + Supabase sync
- Automatic events for cross-tab synchronization
- Full import/export capability
- Search and filter support
