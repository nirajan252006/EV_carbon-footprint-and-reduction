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
        <div className="mb-2.5 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[10px] font-bold tracking-[0.18em] text-cyan-400">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>{eyebrow.toUpperCase()}</span>
        </div>
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-[#F4F7FF] sm:text-4xl">
          {title}{" "}
          <span className="bg-gradient-to-r from-cyan-400 via-hologram-blue to-violet-500 bg-clip-text text-transparent">
            {highlight}
          </span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#A8B3CC]">
          {description}
        </p>
      </div>
      {action && <div className="flex items-center gap-3">{action}</div>}
    </motion.header>
  );
}
