/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        mystic: {
          purple: '#6B46C1',
          dark: '#1A1A2E',
          darker: '#0F0F1E',
        },
        akari: {
          bg: '#0C0F14',
          card: '#0F172A',
          cardSoft: '#111827',
          primary: '#00F6A2',
          accent: '#7BFFDA',
          profit: '#F9F871',
          text: '#F8FAFC',
          muted: '#9CA3AF',
        },
      },
      backgroundImage: {
        'gradient-mystic': 'linear-gradient(135deg, #1A1A2E 0%, #0F0F1E 100%)',
      },
    },
  },
  plugins: [],
};

