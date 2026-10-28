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
    <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="mb-3 flex items-center gap-2 text-[10px] font-bold tracking-[0.18em] text-leaf">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_#48a66c1c]" />
          {eyebrow}
        </p>
        <h1 className="text-3xl font-semibold leading-tight tracking-[-0.04em] text-forest sm:text-4xl">
          {title} <span className="text-leaf">{highlight}</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {action}
    </header>
  );
}
