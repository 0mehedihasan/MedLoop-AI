import type { Config } from 'tailwindcss';

/**
 * MedLoop AI — Tailwind theme.
 *
 * Every colour is declared exactly once, as space-separated RGB channels in
 * `app/globals.css`, and referenced here through `rgb(var(--token) / <alpha-value>)`.
 * That gives one source of truth *and* keeps Tailwind's alpha modifiers working
 * (`bg-surface-panel/60`). Components consume token names; a raw hex literal in a
 * component is a defect (medloop-frontend.md, "Design tokens and visual language").
 *
 * Restraint is a rule, not a taste (CLAUDE.md §11.2): flat fills, one shadow step,
 * 120–200 ms motion, no gradients, no blur panels. There is a single accent — the same
 * blue used for focus, links and `status.info` — so nothing in the UI can look more
 * important than the image being reviewed.
 *
 * The categorical chart ramp is Okabe–Ito, which stays distinguishable under the common
 * forms of colour-vision deficiency. Disease classes draw from that ramp and never from
 * `status.*`: colouring a diagnosis red or green would present it as a verdict.
 */

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          page: 'rgb(var(--surface-page) / <alpha-value>)',
          panel: 'rgb(var(--surface-panel) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised) / <alpha-value>)',
          inset: 'rgb(var(--surface-inset) / <alpha-value>)',
          /** Neutral dark surround for image review, in both themes, as in DICOM viewers. */
          canvas: 'rgb(var(--surface-canvas) / <alpha-value>)',
        },
        content: {
          primary: 'rgb(var(--text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--text-muted) / <alpha-value>)',
          inverse: 'rgb(var(--text-inverse) / <alpha-value>)',
        },
        edge: {
          subtle: 'rgb(var(--border-subtle) / <alpha-value>)',
          DEFAULT: 'rgb(var(--border-default) / <alpha-value>)',
          strong: 'rgb(var(--border-strong) / <alpha-value>)',
          focus: 'rgb(var(--border-focus) / <alpha-value>)',
        },
        status: {
          ok: 'rgb(var(--status-ok) / <alpha-value>)',
          'ok-soft': 'rgb(var(--status-ok-soft) / <alpha-value>)',
          'ok-edge': 'rgb(var(--status-ok-edge) / <alpha-value>)',
          warn: 'rgb(var(--status-warn) / <alpha-value>)',
          'warn-soft': 'rgb(var(--status-warn-soft) / <alpha-value>)',
          'warn-edge': 'rgb(var(--status-warn-edge) / <alpha-value>)',
          danger: 'rgb(var(--status-danger) / <alpha-value>)',
          'danger-soft': 'rgb(var(--status-danger-soft) / <alpha-value>)',
          'danger-edge': 'rgb(var(--status-danger-edge) / <alpha-value>)',
          /** Hover/pressed fill for a filled control. There is one step, not a ramp. */
          'danger-strong': 'rgb(var(--status-danger-strong) / <alpha-value>)',
          info: 'rgb(var(--status-info) / <alpha-value>)',
          'info-soft': 'rgb(var(--status-info-soft) / <alpha-value>)',
          'info-edge': 'rgb(var(--status-info-edge) / <alpha-value>)',
          'info-strong': 'rgb(var(--status-info-strong) / <alpha-value>)',
          neutral: 'rgb(var(--status-neutral) / <alpha-value>)',
          'neutral-soft': 'rgb(var(--status-neutral-soft) / <alpha-value>)',
          'neutral-edge': 'rgb(var(--status-neutral-edge) / <alpha-value>)',
          unknown: 'rgb(var(--status-unknown) / <alpha-value>)',
          'unknown-soft': 'rgb(var(--status-unknown-soft) / <alpha-value>)',
          'unknown-edge': 'rgb(var(--status-unknown-edge) / <alpha-value>)',
        },
        /** Shared by all six chart components. `c*` categorical, `s*` sequential. */
        chart: {
          c1: 'rgb(var(--chart-c1) / <alpha-value>)',
          c2: 'rgb(var(--chart-c2) / <alpha-value>)',
          c3: 'rgb(var(--chart-c3) / <alpha-value>)',
          c4: 'rgb(var(--chart-c4) / <alpha-value>)',
          c5: 'rgb(var(--chart-c5) / <alpha-value>)',
          c6: 'rgb(var(--chart-c6) / <alpha-value>)',
          c7: 'rgb(var(--chart-c7) / <alpha-value>)',
          s1: 'rgb(var(--chart-s1) / <alpha-value>)',
          s2: 'rgb(var(--chart-s2) / <alpha-value>)',
          s3: 'rgb(var(--chart-s3) / <alpha-value>)',
          s4: 'rgb(var(--chart-s4) / <alpha-value>)',
          s5: 'rgb(var(--chart-s5) / <alpha-value>)',
          s6: 'rgb(var(--chart-s6) / <alpha-value>)',
        },
        /**
         * Annotation overlay strokes, consumed as `stroke-annotation-human`,
         * `fill-annotation-human/[0.12]` and so on. Named apart from `chart.*` because a
         * disease class can be drawn in the same swatch on the same screen.
         */
        annotation: {
          human: 'rgb(var(--annotation-human) / <alpha-value>)',
          ai: 'rgb(var(--annotation-ai) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        none: '0px',
        sm: '2px',
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
        full: '9999px',
      },
      boxShadow: {
        // Exactly one step. No layered glows (medloop-frontend.md token table).
        panel: '0 1px 2px 0 rgb(16 24 32 / 0.06)',
        none: 'none',
      },
      transitionDuration: {
        fast: '120ms',
        DEFAULT: '160ms',
        slow: '200ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.2, 0, 0.2, 1)',
      },
      ringWidth: {
        DEFAULT: '2px',
      },
      maxWidth: {
        prose: '68ch',
      },
      spacing: {
        // Sidebar and inspector column widths, referenced by the shell and by nothing else.
        nav: '15rem',
        inspector: '22rem',
      },
      zIndex: {
        // The canvas layer order from medloop-annotation.md, named so it cannot drift.
        backdrop: '1',
        image: '2',
        gradcam: '3',
        aibox: '4',
        human: '5',
        handles: '6',
      },
    },
  },
  plugins: [],
};

export default config;
