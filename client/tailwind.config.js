/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50:  '#f5f5f4',
          100: '#e7e5e4',
          800: '#1f1d1b',
          900: '#141311',
          950: '#0a0908',
        },
        blood: {
          400: '#f87171',
          500: '#dc2626',
          600: '#b91c1c',
          700: '#991b1b',
        },
        money: {
          400: '#86efac',
          500: '#22c55e',
          600: '#16a34a',
        },
        gold: {
          400: '#fbbf24',
          500: '#f59e0b',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Bebas Neue"', 'Impact', 'Oswald', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
