import { Leaf } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

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
    <div className="min-h-screen bg-canvas">
      <header className="mx-auto flex max-w-6xl items-center px-5 py-6 sm:px-8">
        <Link to="/" className="flex items-center gap-3 text-forest">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-ice">
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
      <main className="mx-auto max-w-5xl px-5 pb-12 pt-7 sm:px-8 sm:pt-12">
        <p className="text-[10px] font-bold tracking-[0.18em] text-leaf">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-forest sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
        {children}
      </main>
    </div>
  );
}
