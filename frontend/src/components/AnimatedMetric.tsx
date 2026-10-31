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
  accent?: "cyan" | "violet" | "blue" | "magenta" | "amber";
  glowing?: boolean;
}

const accentConfig = {
  cyan: {
    border: "hover:border-cyan-400/40",
    glow: "hover:shadow-glow-cyan",
    iconBg: "bg-cyan-400/10 text-cyan-400",
    textGradient: "text-cyan-400",
    indicator: "bg-cyan-400",
  },
  violet: {
    border: "hover:border-violet-500/40",
    glow: "hover:shadow-glow-violet",
    iconBg: "bg-violet-500/10 text-violet-400",
    textGradient: "text-violet-400",
    indicator: "bg-violet-500",
  },
  blue: {
    border: "hover:border-hologram-blue/40",
    glow: "hover:shadow-glow-blue",
    iconBg: "bg-hologram-blue/10 text-hologram-blue",
    textGradient: "text-hologram-blue",
    indicator: "bg-hologram-blue",
  },
  magenta: {
    border: "hover:border-hologram-magenta/40",
    glow: "hover:shadow-glow-magenta",
    iconBg: "bg-hologram-magenta/10 text-hologram-magenta",
    textGradient: "text-hologram-magenta",
    indicator: "bg-hologram-magenta",
  },
  amber: {
    border: "hover:border-hologram-amber/40",
    glow: "hover:shadow-glow-amber",
    iconBg: "bg-hologram-amber/10 text-hologram-amber",
    textGradient: "text-hologram-amber",
    indicator: "bg-hologram-amber",
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
  accent = "cyan",
  glowing = false,
}: AnimatedMetricProps) {
  const cfg = accentConfig[accent] || accentConfig.cyan;

  return (
    <motion.div
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      className={`surface-card group relative overflow-hidden p-5 sm:p-6 ${cfg.border} ${
        glowing ? cfg.glow : ""
      }`}
    >
      {/* Top ambient color edge */}
      <div
        className={`absolute inset-x-0 top-0 h-1 opacity-75 ${cfg.indicator} transition-opacity group-hover:opacity-100`}
      />

      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#A8B3CC]">
          {label}
        </p>
        {Icon && (
          <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${cfg.iconBg} transition-transform group-hover:scale-110`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-1">
        {prefix && <span className="text-lg font-bold text-[#A8B3CC]">{prefix}</span>}
        <span className="text-3xl font-extrabold tracking-tight text-[#F4F7FF] sm:text-4xl">
          <CountUp end={value} decimals={decimals} duration={1.2} separator="," preserveValue />
        </span>
        {suffix && (
          <span className="text-sm font-semibold text-[#A8B3CC]">
            {suffix}
          </span>
        )}
      </div>

      {(trend || helper) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3">
          {trend ? (
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <span
                className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                  (trend.positiveIsGood ? trend.value >= 0 : trend.value <= 0)
                    ? "bg-cyan-400/10 text-cyan-400"
                    : "bg-rose-500/15 text-rose-400"
                }`}
              >
                {trend.value > 0 ? `+${trend.value}%` : `${trend.value}%`}
              </span>
              <span className="text-[#A8B3CC]">{trend.label}</span>
            </div>
          ) : (
            <span />
          )}

          {helper && (
            <span className="text-[11px] text-[#A8B3CC]">
              {helper}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
