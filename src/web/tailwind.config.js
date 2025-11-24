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
      },
      backgroundImage: {
        'gradient-mystic': 'linear-gradient(135deg, #1A1A2E 0%, #0F0F1E 100%)',
      },
    },
  },
  plugins: [],
};

