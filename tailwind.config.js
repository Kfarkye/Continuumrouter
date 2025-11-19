// tailwind.config.js

/** @type {import('tailwindcss').Config} */
import defaultTheme from 'tailwindcss/defaultTheme';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class', // Support class-based dark mode
  theme: {
    extend: {
      // Premium Typography
      fontFamily: {
        // Prioritize Inter, then system UI (San Francisco/Segoe UI)
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', ...defaultTheme.fontFamily.sans],
        mono: ['Menlo', 'Monaco', 'Consolas', ...defaultTheme.fontFamily.mono],
      },

      // Premium Charcoal & Accent Colors
      colors: {
        'charcoal': {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa',
          500: '#71717a',
          600: '#52525b',
          700: '#3f3f46', // Ideal for card backgrounds
          800: '#27272a', // Ideal for sidebars/input fields
          900: '#18181b',
          950: '#09090b', // Main background - deepest charcoal
        },
        // NEW: Vibrant blue accent
        'premium-blue': {
          DEFAULT: '#3b82f6',
          500: '#3b82f6',
          600: '#2563eb',
        },
      },

      // Apple-like animations (Refined timings)
      animation: {
        'fadeIn': 'fadeIn 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slideUp': 'slideUp 400ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slideDown': 'slideDown 400ms cubic-bezier(0.16, 1, 0.3, 1)',
        'scaleIn': 'scaleIn 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        // Use step-start for a realistic blinking cursor effect
        'cursor-blink': 'cursor-blink 1.1s step-start infinite',
        'pulse-subtle': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },

      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { transform: 'translateY(15px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          from: { transform: 'translateY(-15px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          from: { transform: 'scale(0.97)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
        'cursor-blink': {
          '50%': { opacity: '0' },
        },
        pulse: {
         '50%': { opacity: 0.5 },
       },
      },

      // Refined border radius
      borderRadius: {
        '10': '10px',
        '11': '11px',
        '14': '14px',
        '16': '16px',
        '18': '18px',
        'xl': '12px',
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '32px',
      },

      // Apple-style letter spacing
      letterSpacing: {
        'tight-apple': '-0.02em',
        'normal-apple': '-0.01em',
        'wide-apple': '0.01em',
      },

      // Premium shadows (Enhanced for Dark Mode)
      boxShadow: {
        'xl-dark': '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
        '2xl-dark': '0 25px 50px -12px rgba(0, 0, 0, 0.75)',

        // Glassmorphism shadows
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.45)',
        'glass-sm': '0 4px 16px 0 rgba(0, 0, 0, 0.30)',
        'glass-lg': '0 12px 48px 0 rgba(0, 0, 0, 0.60)',

        // Accent glow
        'glow': '0 0 25px rgba(59, 130, 246, 0.6)',
        'glow-sm': '0 0 15px rgba(59, 130, 246, 0.4)',
      },

      // Backdrop blur and saturation (Crucial for Liquid Glass)
      backdropBlur: {
        'xs': '2px',
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
        'xl': '20px',
        '2xl': '40px',
        '3xl': '80px',
      },
      backdropSaturate: {
        '140': '1.4',
        '150': '1.5',
        '160': '1.6',
        '180': '1.8',
        '200': '2',
      },
      backdropBrightness: {
        '105': '1.05',
        '106': '1.06',
        '108': '1.08',
        '110': '1.1',
      },

      // Typography scale (Extended)
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem', letterSpacing: '0' }],
        'base': ['1rem', { lineHeight: '1.625rem', letterSpacing: '-0.01em' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],
        'xl': ['1.25rem', { lineHeight: '1.875rem', letterSpacing: '-0.02em' }],
        '2xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.02em' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.03em' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.04em' }],
      },

      // Font weights
      fontWeight: {
        '510': '510',
        '590': '590',
      },

      // Spacing scale (8px system + iOS safe areas)
      spacing: {
        '4.5': '1.125rem', // 18px
        '5.5': '1.375rem', // 22px
        '15': '3.75rem',   // 60px
        '18': '4.5rem',    // 72px
        '22': '5.5rem',    // 88px
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },

      // Transition durations (Apple timing)
      transitionDuration: {
        '100': '100ms',
        '150': '150ms',
        '200': '200ms',
        '250': '250ms',
        '300': '300ms',
        '400': '400ms',
        '500': '500ms',
        '600': '600ms',
      },

      // Transition timing functions
      transitionTimingFunction: {
        'apple': 'cubic-bezier(0.16, 1, 0.3, 1)', // Decelerate (Default)
        'apple-in': 'cubic-bezier(0.42, 0, 1.0, 1)', // Accelerate
        'apple-out': 'cubic-bezier(0.16, 0, 0.3, 1)',
        'apple-in-out': 'cubic-bezier(0.42, 0, 0.58, 1.0)', // Standard Ease
      },

      // Thread view max-width
      maxWidth: {
        'thread': '48rem', // 768px
        'thread-wide': '56rem', // 896px
      },

      // Line heights for readability
      lineHeight: {
        'relaxed-plus': '1.75',
        'loose-plus': '2',
      },
    },
  },
  plugins: [
    // Custom utilities plugin
    function({ addUtilities, theme }) {
      addUtilities({
        // --- Hyper-Minimalist Scrollbar Styles ---
        '.scrollbar-thin': {
          'scrollbar-width': 'thin',
        },
        // Base styles for webkit scrollbars (width/height)
        '.scrollbar-webkit-base': {
            '&::-webkit-scrollbar': {
                width: '8px',
                height: '8px',
            },
        },
        '.scrollbar-track-transparent': {
          'scrollbar-color': `${theme('colors.white/5')} transparent`, // Firefox
          '&::-webkit-scrollbar-track': {
            backgroundColor: 'transparent',
          },
        },
        // Subtle thumb, barely visible when idle
        '.scrollbar-thumb-subtle': {
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '9999px',
            // Creates padding around the thumb using a transparent border
            border: '2px solid transparent',
            backgroundClip: 'padding-box',
          },
        },
        // Active thumb, visible on interaction/hover
        '.scrollbar-thumb-active': {
          '&:hover::-webkit-scrollbar-thumb': {
             backgroundColor: 'rgba(255, 255, 255, 0.25)',
          },
          '&::-webkit-scrollbar-thumb:active': {
            backgroundColor: 'rgba(255, 255, 255, 0.4)',
          },
        },

        // Streaming cursor animation
        '.cursor-premium': {
          animation: theme('animation.cursor-blink'),
          display: 'inline-block',
          width: '0.55em',
          height: '1.1em',
          marginLeft: '0.125rem',
          verticalAlign: 'text-bottom', // Better alignment with text baseline
          backgroundColor: 'currentColor',
          borderRadius: '2px',
        },

        // --- Glassmorphism Utility (Refined) ---
        '.glass-container': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(16px) saturate(180%)',
            WebkitBackdropFilter: 'blur(16px) saturate(180%)', // Safari support
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: theme('boxShadow.glass-sm'),
        },
        // Darker variant for high contrast elements
        '.glass-container-dark': {
            backgroundColor: 'rgba(39, 39, 42, 0.6)', // Charcoal 800 with alpha
            backdropFilter: 'blur(20px) saturate(180%)',
            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            boxShadow: theme('boxShadow.glass'),
        },

        // --- Focus Ring Utility (Accessibility) ---
        '.focus-ring-premium': {
            '&:focus': {
                outline: 'none',
            },
            // Creates an offset focus ring using box-shadow
            '&:focus-visible': {
                boxShadow: `0 0 0 2px ${theme('colors.charcoal.950')}, 0 0 0 4px ${theme('colors.premium-blue.500')}`,
            },
        },

        // --- iOS Touch Optimization ---
        '.touch-target': {
            minWidth: '44px',
            minHeight: '44px',
        },
        '.touch-feedback': {
            transition: 'transform 100ms cubic-bezier(0.16, 1, 0.3, 1)',
            '&:active': {
                transform: 'scale(0.95)',
            },
        },
        '.ios-safe-top': {
            paddingTop: 'max(12px, env(safe-area-inset-top))',
        },
        '.ios-safe-bottom': {
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        },
        '.ios-safe-left': {
            paddingLeft: 'max(12px, env(safe-area-inset-left))',
        },
        '.ios-safe-right': {
            paddingRight: 'max(12px, env(safe-area-inset-right))',
        },
        '.ios-safe-full': {
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
            paddingLeft: 'env(safe-area-inset-left)',
            paddingRight: 'env(safe-area-inset-right)',
        },
      });
    },
  ],
}
