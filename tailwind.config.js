/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          500: '#2f6bff',
          600: '#1f56e6',
          700: '#1a45b8',
        },
      },
    },
  },
  plugins: [],
}
