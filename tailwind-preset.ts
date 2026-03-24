import type { Config } from 'tailwindcss';
import tailwindAnimate from 'tailwindcss-animate';

/**
 * MycoLegal Design System — Tailwind Preset
 *
 * Usage in each app's tailwind.config.ts:
 *   import mycolegalPreset from '../mycolegal-ui/tailwind-preset';
 *   export default { presets: [mycolegalPreset], content: [...] }
 */
const preset = {
  content: [] as string[],
  theme: {
    extend: {
      /* ----------------------------------------------------------------
         Colors — mapped from CSS custom properties
         Usage: bg-mc-primary-500, text-mc-slate-700, etc.
         ---------------------------------------------------------------- */
      colors: {
        mc: {
          primary: {
            50:  'var(--mc-primary-50)',
            100: 'var(--mc-primary-100)',
            200: 'var(--mc-primary-200)',
            300: 'var(--mc-primary-300)',
            400: 'var(--mc-primary-400)',
            500: 'var(--mc-primary-500)',
            600: 'var(--mc-primary-600)',
            700: 'var(--mc-primary-700)',
            800: 'var(--mc-primary-800)',
            900: 'var(--mc-primary-900)',
          },
          slate: {
            50:  'var(--mc-slate-50)',
            100: 'var(--mc-slate-100)',
            200: 'var(--mc-slate-200)',
            300: 'var(--mc-slate-300)',
            400: 'var(--mc-slate-400)',
            500: 'var(--mc-slate-500)',
            600: 'var(--mc-slate-600)',
            700: 'var(--mc-slate-700)',
            800: 'var(--mc-slate-800)',
            900: 'var(--mc-slate-900)',
            950: 'var(--mc-slate-950)',
          },
          neutral: {
            0:   'var(--mc-neutral-0)',
            50:  'var(--mc-neutral-50)',
            100: 'var(--mc-neutral-100)',
            200: 'var(--mc-neutral-200)',
            300: 'var(--mc-neutral-300)',
            400: 'var(--mc-neutral-400)',
            500: 'var(--mc-neutral-500)',
            600: 'var(--mc-neutral-600)',
            700: 'var(--mc-neutral-700)',
            800: 'var(--mc-neutral-800)',
            900: 'var(--mc-neutral-900)',
          },
          success: {
            50:  'var(--mc-success-50)',
            100: 'var(--mc-success-100)',
            500: 'var(--mc-success-500)',
            600: 'var(--mc-success-600)',
            700: 'var(--mc-success-700)',
          },
          error: {
            50:  'var(--mc-error-50)',
            100: 'var(--mc-error-100)',
            500: 'var(--mc-error-500)',
            600: 'var(--mc-error-600)',
            700: 'var(--mc-error-700)',
          },
          warning: {
            50:  'var(--mc-warning-50)',
            100: 'var(--mc-warning-100)',
            500: 'var(--mc-warning-500)',
            600: 'var(--mc-warning-600)',
            700: 'var(--mc-warning-700)',
          },
          info: {
            50:  'var(--mc-info-50)',
            100: 'var(--mc-info-100)',
            500: 'var(--mc-info-500)',
            600: 'var(--mc-info-600)',
            700: 'var(--mc-info-700)',
          },
          app: {
            legifirma: 'var(--mc-app-legifirma)',
            notaria:   'var(--mc-app-notaria)',
            admin:     'var(--mc-app-admin)',
            landing:   'var(--mc-app-landing)',
          },
        },

        /* Semantic aliases — for direct component use */
        background:       'var(--mc-background)',
        'background-muted': 'var(--mc-background-muted)',
        foreground:       'var(--mc-foreground)',
        'foreground-muted': 'var(--mc-foreground-muted)',
        border:           'var(--mc-border)',
        'border-subtle':  'var(--mc-border-subtle)',
        input:            'var(--mc-input-border)',
        ring:             'var(--mc-ring)',
        card:             'var(--mc-card-bg)',
        'card-border':    'var(--mc-card-border)',

        /* shadcn compatibility — maps to our semantic tokens */
        primary: {
          DEFAULT:    'var(--mc-btn-primary-bg)',
          foreground: 'var(--mc-btn-primary-text)',
        },
        secondary: {
          DEFAULT:    'var(--mc-neutral-100)',
          foreground: 'var(--mc-slate-900)',
        },
        destructive: {
          DEFAULT:    'var(--mc-error-600)',
          foreground: 'var(--mc-neutral-0)',
        },
        muted: {
          DEFAULT:    'var(--mc-neutral-100)',
          foreground: 'var(--mc-slate-500)',
        },
        accent: {
          DEFAULT:    'var(--mc-primary-100)',
          foreground: 'var(--mc-primary-800)',
        },
        popover: {
          DEFAULT:    'var(--mc-neutral-0)',
          foreground: 'var(--mc-slate-900)',
        },
      },

      /* ----------------------------------------------------------------
         Typography
         ---------------------------------------------------------------- */
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        xs:    ['0.75rem',  '1rem']       as [string, string],
        sm:    ['0.875rem', '1.25rem']    as [string, string],
        base:  ['1rem',     '1.5rem']     as [string, string],
        lg:    ['1.125rem', '1.75rem']    as [string, string],
        xl:    ['1.25rem',  '1.75rem']    as [string, string],
        '2xl': ['1.5rem',   '2rem']       as [string, string],
        '3xl': ['1.875rem', '2.25rem']    as [string, string],
        '4xl': ['2.25rem',  '2.5rem']     as [string, string],
      },

      /* ----------------------------------------------------------------
         Spacing & Layout
         ---------------------------------------------------------------- */
      borderRadius: {
        sm:   'var(--mc-radius-sm)',
        md:   'var(--mc-radius-md)',
        lg:   'var(--mc-radius-lg)',
        xl:   'var(--mc-radius-xl)',
        full: 'var(--mc-radius-full)',
      },
      maxWidth: {
        content: 'var(--mc-max-w-content)',
      },

      /* ----------------------------------------------------------------
         Shadows
         ---------------------------------------------------------------- */
      boxShadow: {
        sm:   'var(--mc-shadow-sm)',
        md:   'var(--mc-shadow-md)',
        lg:   'var(--mc-shadow-lg)',
        gold: 'var(--mc-shadow-gold)',
      },

      /* ----------------------------------------------------------------
         Transitions
         ---------------------------------------------------------------- */
      transitionDuration: {
        fast:   '150ms',
        normal: '250ms',
        slow:   '400ms',
      },

      /* ----------------------------------------------------------------
         Animations (from tailwindcss-animate)
         ---------------------------------------------------------------- */
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
      },
    },
  },
  plugins: [tailwindAnimate],
} satisfies Partial<Config>;

export default preset;
