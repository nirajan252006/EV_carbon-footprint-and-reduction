import { motion } from "framer-motion";
import { Leaf } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { AmbientBackground } from "./AmbientBackground";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#F7F5F0] text-[#18263A]">
      <AmbientBackground />
      <header className="relative z-10 mx-auto flex max-w-6xl items-center px-5 py-6 sm:px-8">
        <Link to="/" className="group inline-flex items-center gap-3 text-forest transition-transform duration-300 hover:-translate-y-0.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#EAF0F6] shadow-[0_12px_30px_-18px_rgba(49,92,133,0.7)] ring-1 ring-[#D9E3EF] transition-all duration-300 group-hover:shadow-[0_18px_32px_-18px_rgba(49,92,133,0.8)]">
            <Leaf className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-sm font-bold">
            GreenTrack
            <span className="mt-0.5 block text-[8px] tracking-[0.16em] text-slate-400">
              CARBON INTELLIGENCE
            </span>
          </span>
        </Link>
      </header>
      <main className="relative z-10 mx-auto max-w-5xl px-5 pb-12 pt-7 sm:px-8 sm:pt-12">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <p className="text-[10px] font-bold tracking-[0.18em] text-[#315C85]">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[#18263A] sm:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
          {children}
        </motion.div>
      </main>
    </div>
  );
}
