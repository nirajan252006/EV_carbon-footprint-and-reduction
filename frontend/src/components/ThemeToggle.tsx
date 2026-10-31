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
      aria-label={isDark ? "Switch to light sustainability theme" : "Switch to dark futuristic theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className={`group relative flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold backdrop-blur-md transition-all duration-300 ${
        isDark
          ? "border-emerald-500/30 bg-[#0D1B2A]/80 text-ecogreen hover:border-emerald-400 hover:shadow-glow-green"
          : "border-slate-200 bg-white/80 text-slate-700 hover:border-[#315C85]/40 hover:bg-slate-50 shadow-sm"
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
            className="flex items-center justify-center text-ecogreen"
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
            className="flex items-center justify-center text-amber-500"
          >
            <Sun className="h-4 w-4" />
          </motion.div>
        )}
      </div>
      <span className="hidden sm:inline font-medium">
        {isDark ? "Cyber Eco" : "Clean Light"}
      </span>
      <Sparkles className={`h-3 w-3 transition-opacity ${isDark ? "text-ecocyan opacity-75" : "text-slate-400 opacity-40 group-hover:opacity-75"}`} />
    </motion.button>
  );
}
