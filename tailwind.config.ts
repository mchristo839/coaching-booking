import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // See DESIGN.md for the source of truth.
      colors: {
        canvas: '#FBFAF7',
        surface: '#FFFFFF',
        'surface-muted': '#F4F2EC',
        ink: {
          DEFAULT: '#16201A',
          muted: '#5A635C',
        },
        line: '#E6E3DA',
        // One accent. brand-600 is THE green; brand-700 the single hover.
        brand: {
          50: '#EAF3E8',
          100: '#D3E7CF',
          200: '#AFD3A8',
          300: '#85BC7C',
          400: '#5DA152',
          500: '#458F3B',
          600: '#3D8B37', // accent (matches the existing brand green)
          700: '#2F6B2A', // hover / active
          800: '#27561F',
          900: '#1F4419',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'ui-sans-serif', 'sans-serif'],
      },
      borderRadius: {
        lg: '0.625rem', // 10px — buttons, inputs
        xl: '0.875rem', // 14px — cards
      },
      boxShadow: {
        card: '0 1px 2px rgba(22, 32, 26, 0.04), 0 8px 24px -12px rgba(22, 32, 26, 0.12)',
        'card-hover': '0 2px 4px rgba(22, 32, 26, 0.06), 0 16px 40px -16px rgba(22, 32, 26, 0.18)',
      },
      keyframes: {
        'fade-rise': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        aurora: {
          '0%, 100%': { transform: 'translate(-6%, -4%) scale(1)' },
          '50%': { transform: 'translate(6%, 4%) scale(1.12)' },
        },
      },
      animation: {
        'fade-rise': 'fade-rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
        aurora: 'aurora 14s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
export default config
