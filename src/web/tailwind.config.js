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
          bg: '#050811',
          card: '#0A101D',
          cardSoft: '#101727',
          primary: '#00F6A2',
          accent: '#7BFFDA',
          profit: '#F9F871',
          danger: '#FF4D6A',
          muted: '#8C9BB5',
          text: '#F4F7FF',
          border: '#1C2335',
        },
      },
      boxShadow: {
        'akari-glow': '0 0 40px rgba(0,246,162,0.28)',
        'akari-soft': '0 0 24px rgba(0,246,162,0.16)',
      },
      borderRadius: {
        '3xl': '1.5rem',
      },
      backgroundImage: {
        'gradient-mystic': 'linear-gradient(135deg, #1A1A2E 0%, #0F0F1E 100%)',
      },
    },
  },
  plugins: [],
};

