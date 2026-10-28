/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: "#17233D",
        leaf: "#4266E5",
        mint: "#E8F1FF",
        canvas: "#F7F9FC",
        midnight: "#17233D",
        ice: "#E8F1FF",
        lavender: "#F0EBFF",
        violet: "#8061DB",
        silver: "#E4E9F2",
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
