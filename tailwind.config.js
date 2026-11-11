/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--ln-bg)',
        panel: 'var(--ln-panel)',
        'panel-2': 'var(--ln-panel-2)',
        'panel-3': 'var(--ln-panel-3)',
        line: 'var(--ln-border)',
        'line-soft': 'var(--ln-border-soft)',
        ink: 'var(--ln-text)',
        muted: 'var(--ln-muted)',
        dim: 'var(--ln-dim)',
        faint: 'var(--ln-faint)',
        accent: 'var(--ln-accent)',
        'accent-soft': 'var(--ln-accent-soft)',
        'accent-ink': 'var(--ln-accent-ink)',
        fi: 'var(--ln-fi)',
        en: 'var(--ln-en)',
        arrow: 'var(--ln-arrow)',
        record: 'var(--ln-record)',
        'record-idle': 'var(--ln-record-idle)',
        plum: 'var(--ln-plum)',
        brand: 'var(--ln-brand-1)',
        danger: 'var(--ln-danger)',
        warn: 'var(--ln-warn)',
        ok: 'var(--ln-ok)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1rem',
      },
      maxWidth: {
        feed: '100%',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        'pulse-ring': {
          '0%': { opacity: '0.55', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(1.35)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.22s ease-out both',
        'pulse-ring': 'pulse-ring 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
};
