import { motion } from "framer-motion";
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  highlight,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  highlight: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mb-8 flex flex-wrap items-end justify-between gap-5"
    >
      <div>
        <div className="mb-2.5 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-emerald-700 dark:border-ecogreen/30 dark:bg-ecogreen/15 dark:text-ecogreen">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-ecogreen animate-pulse" />
          <span>{eyebrow.toUpperCase()}</span>
        </div>
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-slate-800 dark:text-white sm:text-4xl">
          {title}{" "}
          <span className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 bg-clip-text text-transparent dark:from-ecogreen dark:via-ecocyan dark:to-ecoblue">
            {highlight}
          </span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {description}
        </p>
      </div>
      {action && <div className="flex items-center gap-3">{action}</div>}
    </motion.header>
  );
}
