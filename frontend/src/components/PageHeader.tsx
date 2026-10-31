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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="mb-7 flex flex-wrap items-end justify-between gap-5"
    >
      <div>
        <p className="mb-3 flex items-center gap-2 text-[10px] font-bold tracking-[0.18em] text-[#315C85]">
          <span className="h-2 w-2 rounded-full bg-[#315C85] shadow-[0_0_0_4px_rgba(49,92,133,0.12)]" />
          {eyebrow}
        </p>
        <h1 className="text-3xl font-semibold leading-tight tracking-[-0.04em] text-[#18263A] sm:text-4xl">
          {title} <span className="text-[#315C85]">{highlight}</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {action}
    </motion.header>
  );
}
