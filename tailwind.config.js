/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
	],
  theme: {
    extend: {
      colors: {
        // Legal theme colors - professional blue palette
        legal: {
          primary: '#3b82f6', // Blue
          secondary: '#1e3a8a', // Navy
          accent: '#d4af37', // Gold
          accentHover: '#b8941f'
        },
        // Dark theme optimized for legal content
        dark: {
          bg: {
            primary: '#1E1E1E',
            secondary: '#2B2B2B',
            tertiary: '#2A2A2A',
            elevated: '#333333'
          },
          border: {
            primary: '#3A3A3A',
            secondary: '#404040'
          },
          text: {
            primary: '#FFFFFF',
            secondary: '#B0B0B0',
            muted: '#808080'
          },
          accent: {
            orange: '#3b82f6', // Changed from orange to blue for legal theme
            orangeHover: '#2563eb',
            pink: '#60a5fa', // Light blue instead of pink
            blue: '#3b82f6',
            gold: '#d4af37'
          }
        }
      }
    },
  },
  plugins: [],
}
