import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

export function LoadingState({ label = "Loading GreenTrack…" }: { label?: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-500">
      <LoaderCircle className="h-5 w-5 animate-spin text-leaf" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function SuccessState({ message }: { message: string }) {
  return (
    <div role="status" className="flex gap-2 rounded-lg border border-ice bg-ice p-3 text-sm text-blue-800">
      <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-32 place-items-center rounded-xl border border-dashed border-slate-200 px-5 text-center text-sm text-slate-400">
      {children}
    </div>
  );
}
