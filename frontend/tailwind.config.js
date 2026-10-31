/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        darkbg: "#07111F",
        darksurface: "#0D1B2A",
        darkelevated: "#12243A",
        ecogreen: "#42E695",
        ecoteal: "#20D6C7",
        ecocyan: "#42C9FF",
        ecoblue: "#4F8CFF",
        ecoviolet: "#9B7BFF",
        // Existing tokens preserved for compatibility
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
      boxShadow: {
        "glow-green": "0 0 25px -4px rgba(66, 230, 149, 0.35)",
        "glow-cyan": "0 0 25px -4px rgba(66, 201, 255, 0.35)",
        "glow-violet": "0 0 25px -4px rgba(155, 123, 255, 0.3)",
        "glass-light": "0 18px 45px -18px rgba(49, 92, 133, 0.22)",
        "glass-dark": "0 22px 50px -20px rgba(0, 0, 0, 0.75), 0 0 25px -12px rgba(66, 230, 149, 0.08)",
      },
      animation: {
        "float-slow": "float 7s ease-in-out infinite",
        "float-medium": "float 5s ease-in-out infinite",
        "drift-slow": "drift 28s ease-in-out infinite alternate",
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "radar-pulse": "radar 2.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite",
        "particle-1": "floatParticle 12s ease-in-out infinite",
        "particle-2": "floatParticle 18s ease-in-out infinite 3s",
        "particle-3": "floatParticle 15s ease-in-out infinite 6s",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        drift: {
          "0%": { transform: "translate3d(0, 0, 0) scale(1)" },
          "50%": { transform: "translate3d(2.5rem, -1.5rem, 0) scale(1.08)" },
          "100%": { transform: "translate3d(-1.5rem, 2rem, 0) scale(0.95)" },
        },
        radar: {
          "0%": { transform: "scale(0.95)", opacity: "0.8" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        floatParticle: {
          "0%": { transform: "translate3d(0, 0, 0)", opacity: "0" },
          "20%": { opacity: "0.6" },
          "80%": { opacity: "0.6" },
          "100%": { transform: "translate3d(40px, -120px, 0)", opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};
