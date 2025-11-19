# AI Chat Router - Glassmorphism Design System

## Overview

This design system implements Apple-inspired glassmorphism with 40-60px blur, color saturation, and premium visual polish for the AI Chat Router interface.

## Core Principles

- **Depth through transparency**: Layered glass surfaces with proper blur
- **Color saturation**: Enhanced vibrancy (180-200%) for modern appeal
- **Micro-interactions**: Subtle animations and hover states
- **Apple aesthetics**: SF Pro typography, refined spacing, premium feel

## Design Tokens

### Blur Values
```css
--glass-blur-sm: 20px;    /* Subtle elements */
--glass-blur-md: 40px;    /* Standard glass surfaces */
--glass-blur-lg: 60px;    /* Prominent containers */
```

### Saturation
```css
--glass-saturate: 180%;        /* Standard */
--glass-saturate-heavy: 200%;  /* Emphasis */
```

### Color Palette

#### Primary Colors
| Color | Hex | Usage |
|-------|-----|-------|
| Carolina Blue | `#4B9CD3` | Primary actions, accents, links |
| Blue Light | `#7BAFD4` | Hover states, secondary elements |
| Blue Dark | `#3A8AC3` | Active states, pressed buttons |
| Pure Black | `#000000` | Background, base layer |

#### Glass Surfaces
| Surface | Value | Usage |
|---------|-------|-------|
| Light | `rgba(255, 255, 255, 0.03-0.08)` | Subtle cards, inputs |
| Blue Tint | `rgba(75, 156, 211, 0.03-0.15)` | Highlighted areas, active states |
| Border Light | `rgba(255, 255, 255, 0.08-0.12)` | Subtle borders |
| Border Blue | `rgba(75, 156, 211, 0.2-0.3)` | Emphasized borders |

## Component Patterns

### Interactive Buttons

```css
/* Default State */
background: linear-gradient(135deg, rgba(75, 156, 211, 0.15) 0%, rgba(75, 156, 211, 0.08) 100%);
border: 0.5px solid rgba(75, 156, 211, 0.25);
border-radius: 12-16px;
backdrop-filter: blur(30px) saturate(180%);
-webkit-backdrop-filter: blur(30px) saturate(180%);
box-shadow: 0 4px 12px rgba(75, 156, 211, 0.2);
transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);

/* Hover State */
background: linear-gradient(135deg, rgba(75, 156, 211, 0.25) 0%, rgba(75, 156, 211, 0.15) 100%);
border-color: rgba(75, 156, 211, 0.5);
transform: translateY(-2px);
box-shadow:
  0 8px 20px rgba(75, 156, 211, 0.3),
  0 0 30px rgba(75, 156, 211, 0.2);

/* Active State */
transform: translateY(0) scale(0.98);
```

### Input Fields

```css
/* Default State */
background: rgba(255, 255, 255, 0.04);
border: 0.5px solid rgba(75, 156, 211, 0.2);
border-radius: 14-16px;
backdrop-filter: blur(30px) saturate(160%);
-webkit-backdrop-filter: blur(30px) saturate(160%);
box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.15);
transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);

/* Focus State */
border-color: #4B9CD3;
background: rgba(255, 255, 255, 0.06);
box-shadow:
  0 0 0 3px rgba(75, 156, 211, 0.15),
  inset 0 2px 8px rgba(0, 0, 0, 0.1);
```

### Dropdowns & Modals

```css
background: rgba(10, 10, 10, 0.95);
border: 0.5px solid rgba(75, 156, 211, 0.25);
border-radius: 14px;
backdrop-filter: blur(60px) saturate(180%);
-webkit-backdrop-filter: blur(60px) saturate(180%);
box-shadow:
  0 12px 40px rgba(0, 0, 0, 0.6),
  0 0 0 1px rgba(75, 156, 211, 0.15),
  inset 0 1px 0 rgba(75, 156, 211, 0.08);
animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
```

### Message Bubbles

```css
/* User Messages */
background: linear-gradient(135deg, rgba(75, 156, 211, 0.18) 0%, rgba(75, 156, 211, 0.10) 100%);
border: 0.5px solid rgba(75, 156, 211, 0.35);
backdrop-filter: blur(40px) saturate(180%);
-webkit-backdrop-filter: blur(40px) saturate(180%);
box-shadow:
  0 8px 24px rgba(75, 156, 211, 0.3),
  inset 0 1px 0 rgba(75, 156, 211, 0.2);

/* Assistant Messages */
background: linear-gradient(145deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.03) 100%);
border: 0.5px solid rgba(255, 255, 255, 0.12);
backdrop-filter: blur(40px) saturate(180%);
-webkit-backdrop-filter: blur(40px) saturate(180%);
box-shadow:
  0 8px 32px rgba(0, 0, 0, 0.4),
  inset 0 1px 0 rgba(255, 255, 255, 0.08);
```

## Typography

### Font Stack
```css
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif;
```

### Letter Spacing
| Element | Value |
|---------|-------|
| Body Text | `-0.01em` |
| Headings | `-0.02em` |
| Buttons | `-0.02em` |
| Small Text | `0.06em` (uppercase only) |

### Font Weights
| Weight | Usage |
|--------|-------|
| 400 | Body text, descriptions |
| 500 | Labels, secondary headers |
| 600 | Buttons, primary headers |

## Animation Standards

### Timing Functions
```css
--easing-apple: cubic-bezier(0.16, 1, 0.3, 1);
--timing-fast: 0.2s;
--timing-medium: 0.3s;
--timing-slow: 0.5s;
```

### Standard Animations

#### Fade In
```css
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
```

#### Slide Up
```css
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
```

#### Glow Pulse
```css
@keyframes glowPulse {
  0%, 100% {
    box-shadow: 0 0 20px rgba(75, 156, 211, 0.3);
  }
  50% {
    box-shadow: 0 0 40px rgba(75, 156, 211, 0.5);
  }
}
```

## Shadow Hierarchy

### Elevation Levels
```css
/* Level 1: Subtle elevation */
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);

/* Level 2: Standard elevation */
box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);

/* Level 3: Prominent elevation */
box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);

/* Glow Effect */
box-shadow:
  0 0 30px rgba(75, 156, 211, 0.3),
  0 0 60px rgba(75, 156, 211, 0.15);

/* Combined (elevation + glow) */
box-shadow:
  0 8px 20px rgba(75, 156, 211, 0.3),
  0 0 30px rgba(75, 156, 211, 0.2);
```

## Responsive Breakpoints

| Breakpoint | Width | Blur | Padding | Notes |
|------------|-------|------|---------|-------|
| Mobile | <768px | 30px | 20px | Reduce effects for performance |
| Tablet | 768-1024px | 40px | 24px | Standard effects |
| Desktop | >1024px | 60px | 32px | Full glass experience |

## Accessibility

### Contrast Requirements
- Maintain minimum 4.5:1 contrast ratio for text
- Use solid backgrounds for critical text
- Test all glass surfaces for readability

### Motion Preferences
```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Focus States
- Always include visible focus indicators
- Use 3px outline with Carolina Blue
- Maintain contrast on glass backgrounds

## Implementation Checklist

Before implementing a new component:
- [ ] Backdrop filter includes both blur and saturation
- [ ] Border radius between 12-16px for cards, 8-12px for small elements
- [ ] Transitions use Apple easing curve
- [ ] Hover states include 2px lift
- [ ] Shadow hierarchy properly applied
- [ ] Typography uses SF Pro or system font
- [ ] Letter spacing set appropriately
- [ ] Focus states visible and accessible
- [ ] Reduced motion support included
- [ ] Tested on actual glass backgrounds for readability

## Tailwind Configuration

The project's `tailwind.config.js` includes custom tokens:

```javascript
colors: {
  'carolina-blue': {
    DEFAULT: '#4B9CD3',
    light: '#7BAFD4',
    dark: '#3A8AC3',
  },
},
backdropBlur: {
  'glass-sm': '20px',
  'glass': '40px',
  'glass-lg': '60px',
},
backdropSaturate: {
  'glass': '180%',
  'glass-heavy': '200%',
},
boxShadow: {
  'glass': '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
  'glow-blue': '0 0 30px rgba(75, 156, 211, 0.3), 0 0 60px rgba(75, 156, 211, 0.15)',
},
```

## CSS Custom Properties

Available in `src/index.css`:

```css
:root {
  --glass-blur-sm: 20px;
  --glass-blur-md: 40px;
  --glass-blur-lg: 60px;
  --glass-saturate: 180%;

  --glass-white-03: rgba(255, 255, 255, 0.03);
  --glass-white-06: rgba(255, 255, 255, 0.06);
  --glass-white-08: rgba(255, 255, 255, 0.08);
  --glass-blue-03: rgba(75, 156, 211, 0.03);
  --glass-blue-08: rgba(75, 156, 211, 0.08);
  --glass-blue-15: rgba(75, 156, 211, 0.15);

  --glass-border-light: rgba(255, 255, 255, 0.08);
  --glass-border-medium: rgba(255, 255, 255, 0.12);
  --glass-border-blue: rgba(75, 156, 211, 0.2);

  --shadow-glass: 0 8px 32px rgba(0, 0, 0, 0.4);
  --shadow-glass-inset: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  --shadow-glow-blue: 0 0 30px rgba(75, 156, 211, 0.3);

  --timing-fast: 0.2s;
  --timing-medium: 0.3s;
  --timing-slow: 0.5s;
  --easing-apple: cubic-bezier(0.16, 1, 0.3, 1);
}
```

## AI Models

The application supports 4 AI models with consistent glassmorphism UI:

1. **Auto Router** - Intelligently selects the best AI
2. **GPT-5** - OpenAI GPT-5 (Advanced reasoning)
3. **Claude Sonnet 4.5** - Anthropic Claude (Code analysis)
4. **Gemini 2.5 Flash** - Google Gemini (Fast and efficient)

Each model selector maintains the same visual language with proper glass effects and hover states.
