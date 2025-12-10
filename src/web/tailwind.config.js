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
          bg: '#000000', // Near-black background
          card: '#0a0a0a',
          cardSoft: '#111111',
          primary: '#00F6A2', // Teal
          accent: '#7BFFDA',
          profit: '#F9F871',
          danger: '#FF4D6A',
          muted: '#8CA0B8',
          text: '#E5F5FF',
          border: '#1C2335',
          // Neon accent colors
          neon: {
            teal: '#00F6A2',
            blue: '#00D4FF',
            pink: '#FF10F0',
            violet: '#A855F7',
            cyan: '#06B6D4',
          },
        },
      },
      boxShadow: {
        'akari-glow': '0 0 40px rgba(0,246,162,0.28)',
        'akari-soft': '0 0 24px rgba(0,246,162,0.16)',
        'neon-teal': '0 0 20px rgba(0,246,162,0.4), 0 0 40px rgba(0,246,162,0.2), inset 0 0 20px rgba(0,246,162,0.1)',
        'neon-blue': '0 0 20px rgba(0,212,255,0.4), 0 0 40px rgba(0,212,255,0.2), inset 0 0 20px rgba(0,212,255,0.1)',
        'neon-pink': '0 0 20px rgba(255,16,240,0.4), 0 0 40px rgba(255,16,240,0.2), inset 0 0 20px rgba(255,16,240,0.1)',
        'neon-violet': '0 0 20px rgba(168,85,247,0.4), 0 0 40px rgba(168,85,247,0.2), inset 0 0 20px rgba(168,85,247,0.1)',
        'soft-glow': '0 0 30px rgba(0,246,162,0.15), inset 0 1px 0 rgba(255,255,255,0.05)',
        'card-hover': '0 8px 32px rgba(0,246,162,0.2), 0 0 0 1px rgba(0,246,162,0.3)',
      },
      borderRadius: {
        '3xl': '1.5rem',
      },
      backgroundImage: {
        'gradient-mystic': 'linear-gradient(135deg, #1A1A2E 0%, #0F0F1E 100%)',
        'gradient-neon': 'linear-gradient(135deg, #00F6A2 0%, #00D4FF 50%, #FF10F0 100%)',
        'gradient-neon-blue': 'linear-gradient(135deg, #00D4FF 0%, #A855F7 100%)',
        'gradient-neon-pink': 'linear-gradient(135deg, #FF10F0 0%, #A855F7 100%)',
        'gradient-neon-teal': 'linear-gradient(135deg, #00F6A2 0%, #00D4FF 100%)',
        'gradient-card': 'linear-gradient(135deg, rgba(10,10,10,0.9) 0%, rgba(17,17,17,0.9) 100%)',
      },
      transitionDuration: {
        '300': '300ms',
        '500': '500ms',
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 3s ease infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: '1', filter: 'brightness(1)' },
          '50%': { opacity: '0.8', filter: 'brightness(1.2)' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
    },
  },
  plugins: [],
};

