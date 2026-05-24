/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        windGray: '#1A1A1A',
      },
      fontFamily: {
        // نربط الخط الأساسي للمشروع بمتغير خط Cairo
        sans: ['var(--font-cairo)', 'Cairo', 'sans-serif'],
      },
    },
  },
  plugins: [],
}