import { Bell, Download, FileUp, Target } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { EmptyState, ErrorState, LoadingState, SuccessState } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { api } from "../services/api";
import type { DashboardData, Recommendation } from "../types/api";

function currentPeriod() {
  return `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
}

export function ReductionPlannerPage() {
  const [period] = useState(currentPeriod);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [target, setTarget] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, items] = await Promise.all([api.getDashboard(period), api.getRecommendations(period)]);
      setDashboard(data);
      setTarget(data.monthly_target_kg?.toString() ?? "");
      setRecommendations(items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Planning data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  async function submitTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const value = target.trim() === "" ? null : Number(target);
      if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error("Enter a non-negative monthly target.");
      await api.setTarget(value);
      setNotice(value === null ? "Monthly target cleared." : "Monthly target saved.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Target could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !dashboard) return <LoadingState label="Loading reduction plan…" />;

  return <div>
    <PageHeader eyebrow="COLLEGE SUSTAINABILITY" title="Carbon reduction" highlight="planner." description="Set a measured workspace target and review source-category planning prompts. Savings shown by recommendations are planning scenarios, not guaranteed reductions." />
    {error && <div className="mb-4"><ErrorState message={error} /></div>}
    {notice && <div className="mb-4"><SuccessState message={notice} /></div>}
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <form onSubmit={submitTarget} className="surface-card h-fit p-5">
        <div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-ice text-leaf"><Target className="h-5 w-5" /></span><div><h2 className="text-sm font-semibold text-slate-800">Monthly target</h2><p className="mt-1 text-xs text-slate-400">kg CO₂e</p></div></div>
        <label className="form-label">Target emissions<input className="form-input" type="number" min="0" step="0.01" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Leave blank to clear" /></label>
        <button className="btn-primary mt-4" type="submit" disabled={saving}>{saving ? "Saving…" : "Save target"}</button>
      </form>
      <section className="surface-card p-5">
        <h2 className="text-sm font-semibold text-slate-800">Planning opportunities</h2>
        {dashboard && recommendations.length > 0 ? <div className="mt-4 grid gap-3 md:grid-cols-2">{recommendations.map((item, index) => <article key={`${item.category}-${index}`} className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase text-leaf">{item.category}</p><p className="mt-2 text-sm text-slate-600">{item.reason}</p><p className="mt-3 text-sm font-semibold text-slate-800">{item.action}</p></article>)}</div> : <div className="mt-4"><EmptyState>Reduction opportunities appear after measured activities exist and source-backed factors are configured.</EmptyState></div>}
      </section>
    </div>
  </div>;
}

export function SustainabilityGoalsPage() {
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void api.getDashboard(currentPeriod()).then((dashboard) => {
      setTarget(dashboard.monthly_target_kg?.toString() ?? "");
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Current goal could not be loaded."));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(null); setNotice(null);
    try {
      const value = target.trim() === "" ? null : Number(target);
      if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error("Enter a non-negative monthly target.");
      await api.setTarget(value);
      setNotice(value === null ? "Sustainability target cleared." : "Sustainability target saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sustainability target could not be saved.");
    } finally { setSaving(false); }
  }

  return <div>
    <PageHeader eyebrow="COLLEGE SUSTAINABILITY" title="Sustainability" highlight="goals." description="This workspace currently supports one persisted monthly emissions target. Annual and semester-wide goal models are not implemented by the backend." />
    {error && <div className="mb-4"><ErrorState message={error} /></div>}
    {notice && <div className="mb-4"><SuccessState message={notice} /></div>}
    <form onSubmit={submit} className="surface-card max-w-xl p-5 sm:p-7">
      <label className="form-label">Monthly emissions goal (kg CO₂e)<input className="form-input" type="number" min="0" step="0.01" value={target} onChange={(event) => setTarget(event.target.value)} placeholder="Leave blank to remove the target" /></label>
      <button className="btn-primary mt-4" type="submit" disabled={saving}>{saving ? "Saving…" : "Save goal"}</button>
    </form>
  </div>;
}

export function CollegeDataExchangePage() {
  const [period] = useState(currentPeriod);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportRecords() {
    setBusy(true); setError(null);
    try {
      const blob = await api.report(period);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = `college-report-${period}.csv`; link.click();
      URL.revokeObjectURL(url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Export failed."); }
    finally { setBusy(false); }
  }

  return <div>
    <PageHeader eyebrow="REPORTING & ADMINISTRATION" title="Data import" highlight="and export." description="Export the existing workspace activity report as CSV. Activity import is not enabled because the backend has no import format or validation contract." />
    {error && <div className="mb-4"><ErrorState message={error} /></div>}
    <div className="grid gap-4 md:grid-cols-2">
      <article className="surface-card p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-ice text-leaf"><Download className="h-5 w-5" /></span><h2 className="mt-4 text-sm font-semibold text-slate-800">Export available records</h2><p className="mt-2 text-sm text-slate-500">Download the real saved activity report for the current month.</p><button className="btn-primary mt-4" type="button" onClick={() => void exportRecords()} disabled={busy}>{busy ? "Preparing…" : "Export CSV"}</button></article>
      <article className="surface-card p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-lavender text-violet"><FileUp className="h-5 w-5" /></span><h2 className="mt-4 text-sm font-semibold text-slate-800">Import activity data</h2><p className="mt-2 text-sm text-slate-500">Not available yet. Import requires a supported schema, factor matching, validation, and authorization tests.</p><button className="btn-secondary mt-4" type="button" disabled>Import unavailable</button></article>
    </div>
  </div>;
}

export function CollegeNotificationsPage() {
  const [period] = useState(currentPeriod);
  const [items, setItems] = useState<Array<{ id: string; title: string; detail: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true); setError(null);
      try {
        const [dashboard, factors] = await Promise.all([api.getDashboard(period), api.getFactors()]);
        if (!active) return;
        const alerts: Array<{ id: string; title: string; detail: string }> = [];
        if (factors.length === 0) alerts.push({ id: "factors", title: "Emission factors missing", detail: "Add source-backed factors before logging factor-dependent activities." });
        if (dashboard.activity_count === 0) alerts.push({ id: "activities", title: "No activity data this month", detail: "The selected month has no persisted activity records." });
        if (dashboard.monthly_target_kg !== null && dashboard.total_kg > dashboard.monthly_target_kg) alerts.push({ id: "target", title: "Monthly target exceeded", detail: "Measured emissions are above the saved workspace target." });
        setItems(alerts);
      } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "Alerts could not be loaded."); }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [period]);

  if (loading) return <LoadingState label="Checking workspace alerts…" />;
  return <div>
    <PageHeader eyebrow="REPORTING & ADMINISTRATION" title="Notifications" highlight="and alerts." description="These alerts are derived from the current workspace dashboard, factors, and monthly target. They are not stored notification history." />
    {error && <ErrorState message={error} />}
    <section className="grid gap-3">{items.map((item) => <article key={item.id} className="surface-card flex items-start gap-4 p-5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ice text-leaf"><Bell className="h-5 w-5" /></span><div><h2 className="text-sm font-semibold text-slate-800">{item.title}</h2><p className="mt-1 text-sm text-slate-500">{item.detail}</p></div></article>)}</section>
    {!items.length && !error && <EmptyState>No current workspace alerts were found.</EmptyState>}
  </div>;
}
