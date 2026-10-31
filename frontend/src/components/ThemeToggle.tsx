import { motion } from "framer-motion";
import { Moon, Sparkles, Sun } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <motion.button
      type="button"
      onClick={toggleTheme}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark digital theme"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`group relative flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold backdrop-blur-md transition-all duration-300 ${
        isDark
          ? "border-cyan-400/30 bg-[#0D142A]/85 text-cyan-400 hover:border-cyan-400 hover:shadow-glow-cyan"
          : "border-white/10 bg-white/10 text-[#F4F7FF] hover:border-violet-500/40 hover:bg-white/15"
      } ${className}`}
    >
      <div className="relative h-4 w-4">
        {isDark ? (
          <motion.div
            key="moon"
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center justify-center text-cyan-400"
          >
            <Moon className="h-4 w-4" />
          </motion.div>
        ) : (
          <motion.div
            key="sun"
            initial={{ rotate: 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -90, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center justify-center text-hologram-amber"
          >
            <Sun className="h-4 w-4" />
          </motion.div>
        )}
      </div>
      <span className="hidden sm:inline font-medium">
        {isDark ? "Cyber Dark" : "Clean Light"}
      </span>
      <Sparkles className="h-3 w-3 opacity-60 text-violet-400 group-hover:opacity-100" />
    </motion.button>
  );
}
