/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#030712',
        surface: {
          DEFAULT: 'rgba(15, 23, 42, 0.65)',
          light: 'rgba(30, 41, 59, 0.4)',
        },
        border: {
          DEFAULT: 'rgba(148, 163, 184, 0.2)',
          light: 'rgba(255, 255, 255, 0.1)',
        },
        'text-primary': '#f1f5f9',
        'text-secondary': '#94a3b8',
        'text-muted': '#64748b',
        primary: {
          DEFAULT: '#3b82f6',
          light: 'rgba(59, 130, 246, 0.4)',
        },
        accent: '#ec4899',
        success: '#22c55e',
        danger: '#ef4444',
      },
      fontFamily: {
        sans: ["'Inter'", 'system-ui', '-apple-system', 'BlinkMacSystemFont', "'Segoe UI'", 'sans-serif'],
      },
    },
  },
  plugins: [],
};
