import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import CountUp from "react-countup";

interface AnimatedMetricProps {
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  helper?: string;
  trend?: {
    value: number;
    label: string;
    positiveIsGood?: boolean;
  };
  icon?: LucideIcon;
  accent?: "green" | "cyan" | "violet" | "blue";
  glowing?: boolean;
}

const accentConfig = {
  green: {
    border: "dark:hover:border-ecogreen/40",
    glow: "dark:hover:shadow-glow-green",
    iconBg: "bg-emerald-500/10 text-emerald-600 dark:bg-ecogreen/15 dark:text-ecogreen",
    textGradient: "dark:text-ecogreen",
    indicator: "bg-emerald-500 dark:bg-ecogreen",
  },
  cyan: {
    border: "dark:hover:border-ecocyan/40",
    glow: "dark:hover:shadow-glow-cyan",
    iconBg: "bg-cyan-500/10 text-cyan-600 dark:bg-ecocyan/15 dark:text-ecocyan",
    textGradient: "dark:text-ecocyan",
    indicator: "bg-cyan-500 dark:bg-ecocyan",
  },
  violet: {
    border: "dark:hover:border-ecoviolet/40",
    glow: "dark:hover:shadow-[0_0_24px_rgba(155,123,255,0.35)]",
    iconBg: "bg-violet-500/10 text-violet-600 dark:bg-ecoviolet/15 dark:text-ecoviolet",
    textGradient: "dark:text-ecoviolet",
    indicator: "bg-violet-500 dark:bg-ecoviolet",
  },
  blue: {
    border: "dark:hover:border-ecoblue/40",
    glow: "dark:hover:shadow-[0_0_24px_rgba(79,140,255,0.35)]",
    iconBg: "bg-blue-500/10 text-blue-600 dark:bg-ecoblue/15 dark:text-ecoblue",
    textGradient: "dark:text-ecoblue",
    indicator: "bg-blue-500 dark:bg-ecoblue",
  },
};

export function AnimatedMetric({
  label,
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  helper,
  trend,
  icon: Icon,
  accent = "green",
  glowing = false,
}: AnimatedMetricProps) {
  const cfg = accentConfig[accent];

  return (
    <motion.div
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      className={`surface-card group relative overflow-hidden p-5 sm:p-6 ${cfg.border} ${
        glowing ? cfg.glow : ""
      }`}
    >
      {/* Top ambient color edge */}
      <div
        className={`absolute inset-x-0 top-0 h-1 opacity-70 ${cfg.indicator} transition-opacity group-hover:opacity-100`}
      />

      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </p>
        {Icon && (
          <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${cfg.iconBg} transition-transform group-hover:scale-110`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-1">
        {prefix && <span className="text-lg font-bold text-slate-500 dark:text-slate-400">{prefix}</span>}
        <span className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          <CountUp end={value} decimals={decimals} duration={1.2} separator="," preserveValue />
        </span>
        {suffix && (
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            {suffix}
          </span>
        )}
      </div>

      {(trend || helper) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
          {trend ? (
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <span
                className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                  (trend.positiveIsGood ? trend.value >= 0 : trend.value <= 0)
                    ? "bg-emerald-500/10 text-emerald-700 dark:bg-ecogreen/15 dark:text-ecogreen"
                    : "bg-rose-500/10 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400"
                }`}
              >
                {trend.value > 0 ? `+${trend.value}%` : `${trend.value}%`}
              </span>
              <span className="text-slate-400 dark:text-slate-500">{trend.label}</span>
            </div>
          ) : (
            <span />
          )}

          {helper && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {helper}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
