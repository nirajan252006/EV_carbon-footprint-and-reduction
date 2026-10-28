import { motion } from "framer-motion";
import { ArrowRight, Building2, Leaf, School, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ErrorState } from "../components/Feedback";
import { useWorkspace } from "../hooks/WorkspaceContext";
import { api } from "../services/api";
import type { AccountType } from "../types/api";

const accountTypes: Array<{
  value: AccountType;
  title: string;
  description: string;
  icon: typeof UserRound;
}> = [
  { value: "individual", title: "Individual", description: "Personal footprint and progress", icon: UserRound },
  { value: "college", title: "College", description: "Campus, facility, or department activity", icon: School },
  { value: "organization", title: "Organization", description: "Facility and team reporting", icon: Building2 },
];

export function OnboardingPage() {
  const { workspace, setWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState<AccountType>(workspace?.account_type ?? "individual");
  const [name, setName] = useState(workspace?.name ?? "");
  const [region, setRegion] = useState(workspace?.region ?? "India");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const saved = await api.saveWorkspace({ name: name.trim(), account_type: accountType, region: region.trim() });
      setWorkspace(saved);
      navigate("/dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Workspace could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-7 sm:px-8">
        <Link to="/dashboard" className="flex items-center gap-3 text-forest">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-200 font-bold">G</span>
          <span className="text-sm font-bold">GreenTrack<span className="mt-0.5 block text-[8px] tracking-[0.16em] text-slate-400">CARBON INTELLIGENCE</span></span>
        </Link>
        {workspace && <Link className="text-sm font-medium text-leaf hover:underline" to="/dashboard">Back to dashboard</Link>}
      </header>
      <main className="mx-auto max-w-5xl px-5 pb-12 pt-10 sm:px-8 sm:pt-16">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <p className="mb-3 flex items-center gap-2 text-[10px] font-bold tracking-[0.18em] text-leaf"><Leaf className="h-4 w-4" /> GET STARTED</p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.05em] text-forest sm:text-6xl">
            Measure what matters.<br /><span className="text-leaf">Change what’s possible.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-500">
            Choose a workspace type to shape your GreenTrack experience. Record real activity and use documented emission factors.
          </p>
        </motion.div>

        <form onSubmit={submit} className="mt-9 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_42px_#183a260c] sm:p-8">
          <fieldset>
            <legend className="mb-4 text-sm font-semibold text-slate-700">Choose an account type</legend>
            <div className="grid gap-3 md:grid-cols-3">
              {accountTypes.map(({ value, title, description, icon: Icon }, index) => (
                <motion.label
                  key={value}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.06, duration: 0.2 }}
                  className={`group flex min-h-32 cursor-pointer flex-col rounded-xl border p-4 transition ${
                    accountType === value ? "border-leaf bg-emerald-50/70 ring-2 ring-emerald-100" : "border-slate-200 hover:border-emerald-300 hover:bg-slate-50"
                  }`}
                >
                  <input className="sr-only" type="radio" name="account_type" value={value} checked={accountType === value} onChange={() => setAccountType(value)} />
                  <span className={`grid h-9 w-9 place-items-center rounded-xl ${accountType === value ? "bg-emerald-100 text-leaf" : "bg-slate-100 text-slate-500"}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <strong className="mt-3 text-sm text-slate-800">{title}</strong>
                  <span className="mt-1 text-xs text-slate-500">{description}</span>
                </motion.label>
              ))}
            </div>
          </fieldset>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-xs font-medium text-slate-600">
              Workspace name
              <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required placeholder="e.g. GreenTrack home" className="form-input" />
            </label>
            <label className="grid gap-2 text-xs font-medium text-slate-600">
              Region
              <input value={region} onChange={(event) => setRegion(event.target.value)} minLength={2} maxLength={120} required placeholder="Country or state" className="form-input" />
            </label>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-xs leading-5 text-slate-400">
              Prototype note: this creates a local workspace profile, not a sign-in. Authentication and multi-user access controls are not implemented.
            </p>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : workspace ? "Save workspace" : "Create workspace"} <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          {error && <div className="mt-4"><ErrorState message={error} /></div>}
        </form>
      </main>
    </div>
  );
}
