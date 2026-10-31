/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Digital Climate Intelligence Palette (Strictly NO GREEN)
        navy: {
          950: "#080D1B", // Midnight navy primary canvas
          900: "#0D142A",
          800: "#131D3B",
          700: "#1E2B4F",
        },
        violet: {
          950: "#17102B", // Deep violet surface
          900: "#22173F",
          800: "#312059",
          500: "#A855F7", // Neon violet accent
          400: "#C084FC",
        },
        cyan: {
          400: "#00E5FF", // Electric cyan primary highlight
          300: "#33EBFF",
          500: "#00B8D4",
        },
        hologram: {
          blue: "#397BFF", // Holographic blue
          magenta: "#F472D0", // Soft magenta
          amber: "#FFB547", // Amber alerts
        },
        cyber: {
          text: "#F4F7FF", // Primary text
          muted: "#A8B3CC", // Secondary text
          glass: "rgba(255, 255, 255, 0.07)",
          surface: "rgba(13, 20, 42, 0.75)",
          elevated: "rgba(23, 16, 43, 0.85)",
          border: "rgba(0, 229, 255, 0.2)",
          borderViolet: "rgba(168, 85, 247, 0.25)",
        },
      },
      boxShadow: {
        "glow-cyan": "0 0 25px -4px rgba(0, 229, 255, 0.45)",
        "glow-violet": "0 0 25px -4px rgba(168, 85, 247, 0.45)",
        "glow-blue": "0 0 25px -4px rgba(57, 123, 255, 0.45)",
        "glow-magenta": "0 0 25px -4px rgba(244, 114, 208, 0.45)",
        "glow-amber": "0 0 25px -4px rgba(255, 181, 71, 0.45)",
        "glass-cyber": "0 18px 40px -15px rgba(0, 0, 0, 0.7), inset 0 1px 1px 0 rgba(255, 255, 255, 0.1)",
      },
      animation: {
        "spin-slow": "spin 80s linear infinite",
        "pulse-fast": "pulse 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "radar-ping": "radar-ping 2.4s cubic-bezier(0, 0, 0.2, 1) infinite",
        "float-particle": "float-particle 20s linear infinite",
        "aurora-shift": "aurora-shift 24s ease-in-out infinite alternate",
      },
    },
  },
  plugins: [],
};
