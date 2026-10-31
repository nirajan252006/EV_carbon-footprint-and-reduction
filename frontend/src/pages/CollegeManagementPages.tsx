import { Bell, Download, FileUp, Target } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { EmptyState, ErrorState, LoadingState, SuccessState } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { api } from "../services/api";
import type { DashboardData, Recommendation, ReductionGoal } from "../types/api";

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

  return (
    <div>
      <PageHeader
        eyebrow="CAMPUS SUSTAINABILITY"
        title="Carbon reduction"
        highlight="planner."
        description="Set a measured workspace target and review source-category planning prompts. Savings shown by recommendations are planning scenarios, not guaranteed reductions."
      />
      {error && <div className="mb-4"><ErrorState message={error} /></div>}
      {notice && <div className="mb-4"><SuccessState message={notice} /></div>}
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <form onSubmit={submitTarget} className="surface-card h-fit p-5">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-ice text-leaf">
              <Target className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Monthly target</h2>
              <p className="mt-1 text-xs text-slate-400">kg CO₂e</p>
            </div>
          </div>
          <label className="form-label">
            Target emissions
            <input
              className="form-input"
              type="number"
              min="0"
              step="0.01"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder="Leave blank to clear"
            />
          </label>
          <button className="btn-primary mt-4" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save target"}
          </button>
        </form>
        <section className="surface-card p-5">
          <h2 className="text-sm font-semibold text-slate-800">Planning opportunities</h2>
          {dashboard && recommendations.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {recommendations.map((item, index) => (
                <article key={`${item.category}-${index}`} className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-bold uppercase text-leaf">{item.category}</p>
                  <p className="mt-2 text-sm text-slate-600">{item.reason}</p>
                  <p className="mt-3 text-sm font-semibold text-slate-800">{item.action}</p>
                  {item.estimated_savings_kg && (
                    <p className="mt-2 text-xs font-medium text-blue-700">
                      Scenario: {item.estimated_savings_kg} kg CO₂e avoided ({item.savings_note})
                    </p>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState>Reduction opportunities appear after measured activities exist and source-backed factors are configured.</EmptyState>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function SustainabilityGoalsPage() {
  const [goals, setGoals] = useState<ReductionGoal[]>([]);
  const [title, setTitle] = useState("");
  const [baselinePeriod, setBaselinePeriod] = useState(currentPeriod());
  const [baselineEmissions, setBaselineEmissions] = useState("");
  const [targetPct, setTargetPct] = useState("15");
  const [targetPeriod, setTargetPeriod] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, dashboard] = await Promise.all([
        api.getGoals(),
        api.getDashboard(baselinePeriod).catch(() => null),
      ]);
      setGoals(list);
      if (dashboard && dashboard.total_kg > 0 && !baselineEmissions) {
        setBaselineEmissions(String(dashboard.total_kg));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reduction goals.");
    } finally {
      setLoading(false);
    }
  }, [baselinePeriod]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreateGoal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const baseKg = Number(baselineEmissions);
    const pct = Number(targetPct);
    if (!title.trim() || baseKg <= 0 || pct <= 0 || pct > 100) {
      setError("Please fill all fields with valid positive numbers.");
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.createGoal({
        title: title.trim(),
        baseline_period: baselinePeriod,
        baseline_emissions_kg: baseKg,
        target_reduction_pct: pct,
        target_period: targetPeriod,
      });
      setNotice(`Reduction goal '${title}' created successfully.`);
      setTitle("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create reduction goal.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateStatus(goalId: string, status: string) {
    try {
      await api.updateGoalStatus(goalId, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update goal status.");
    }
  }

  const baseKgNum = Number(baselineEmissions) || 0;
  const pctNum = Number(targetPct) || 0;
  const targetEmissionsCalc = baseKgNum > 0 ? baseKgNum * (1.0 - pctNum / 100.0) : 0;

  return (
    <div>
      <PageHeader
        eyebrow="CAMPUS SUSTAINABILITY"
        title="Reduction goals"
        highlight="& progress tracking."
        description="Establish baseline emissions, commit to percentage reduction targets, and track observed progress mathematically: Reduction = B - C, Percentage = ((B - C) / B) × 100."
      />

      {error && <div className="mb-4"><ErrorState message={error} /></div>}
      {notice && <div className="mb-4"><SuccessState message={notice} /></div>}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Create Goal Form */}
        <section className="surface-card h-fit p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-ice text-leaf">
              <Target className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Set Reduction Target</h2>
              <p className="text-xs text-slate-500">Grounded in measured baseline data</p>
            </div>
          </div>

          <form onSubmit={handleCreateGoal} className="space-y-4">
            <label className="form-label">
              Goal Title *
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Q4 20% Electricity Reduction"
                className="form-input"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="form-label">
                Baseline Month *
                <input
                  type="month"
                  required
                  value={baselinePeriod}
                  onChange={(e) => setBaselinePeriod(e.target.value)}
                  className="form-input"
                />
              </label>

              <label className="form-label">
                Baseline Emissions (kg) *
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  required
                  value={baselineEmissions}
                  onChange={(e) => setBaselineEmissions(e.target.value)}
                  placeholder="e.g. 1000.0"
                  className="form-input"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="form-label">
                Target Reduction (%) *
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="any"
                  required
                  value={targetPct}
                  onChange={(e) => setTargetPct(e.target.value)}
                  placeholder="e.g. 15"
                  className="form-input"
                />
              </label>

              <label className="form-label">
                Target Deadline Month *
                <input
                  type="month"
                  required
                  value={targetPeriod}
                  onChange={(e) => setTargetPeriod(e.target.value)}
                  className="form-input"
                />
              </label>
            </div>

            {baseKgNum > 0 && (
              <div className="rounded-xl bg-blue-50/70 p-3 text-xs text-blue-900">
                <span className="font-bold">Calculated Target:</span>{" "}
                {targetEmissionsCalc.toFixed(2)} kg CO₂e ({pctNum}% reduction from {baseKgNum} kg)
              </div>
            )}

            <button type="submit" disabled={saving || !title.trim()} className="btn-primary w-full justify-center">
              {saving ? "Saving Goal…" : "Commit Reduction Goal"}
            </button>
          </form>
        </section>

        {/* Goals List & Progress */}
        <section className="surface-card p-5">
          <h2 className="text-sm font-bold text-slate-900">Active Goals & Commitments</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Progress tracked against verified emissions calculations.
          </p>

          {loading ? (
            <div className="mt-6"><LoadingState label="Loading goals…" /></div>
          ) : goals.length === 0 ? (
            <div className="mt-6">
              <EmptyState>No reduction goals created yet. Set a baseline and target above to begin tracking.</EmptyState>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {goals.map((g) => (
                <div key={g.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">{g.title}</h3>
                      <p className="text-xs text-slate-400">
                        Baseline: {g.baseline_period} ({g.baseline_emissions_kg} kg CO₂e) → Target: {g.target_period}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${
                        g.status === "achieved"
                          ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                          : g.status === "active"
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {g.status}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="text-slate-500">Target Reduction:</span>{" "}
                      <strong className="text-cyan-400">{g.target_reduction_pct}%</strong> (Max {g.target_emissions_kg} kg CO₂e)
                    </div>
                    <div className="flex gap-2">
                      {g.status === "active" && (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(g.id, "achieved")}
                          className="btn-secondary py-1 text-xs text-cyan-400 hover:bg-cyan-500/10"
                        >
                          Mark Achieved
                        </button>
                      )}
                      {g.status === "active" && (
                        <button
                          type="button"
                          onClick={() => handleUpdateStatus(g.id, "cancelled")}
                          className="btn-secondary py-1 text-xs text-slate-500"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
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

  return (
    <div>
      <PageHeader
        eyebrow="REPORTING & ADMINISTRATION"
        title="Data import"
        highlight="and export."
        description="Export the verified workspace activity report as CSV with traceable factor URLs and immutable snapshots."
      />
      {error && <div className="mb-4"><ErrorState message={error} /></div>}
      <div className="grid gap-4 md:grid-cols-2">
        <article className="surface-card p-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-ice text-leaf">
            <Download className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-slate-800">Export verified records</h2>
          <p className="mt-2 text-sm text-slate-500">Download the real saved activity report for the current month.</p>
          <button className="btn-primary mt-4" type="button" onClick={() => void exportRecords()} disabled={busy}>
            {busy ? "Preparing…" : "Export CSV"}
          </button>
        </article>
        <article className="surface-card p-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-lavender text-violet">
            <FileUp className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-sm font-semibold text-slate-800">Electricity bill import (OCR)</h2>
          <p className="mt-2 text-sm text-slate-500">
            Use the Electricity Bill OCR Scanner in the Activity page to parse utility bills automatically.
          </p>
          <a href="/college/activity" className="btn-secondary mt-4 inline-block text-center">
            Go to Bill Upload →
          </a>
        </article>
      </div>
    </div>
  );
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
  return (
    <div>
      <PageHeader
        eyebrow="REPORTING & ADMINISTRATION"
        title="Notifications"
        highlight="and alerts."
        description="These alerts are derived from the current workspace dashboard, factors, and monthly target. They are not stored notification history."
      />
      {error && <ErrorState message={error} />}
      <section className="grid gap-3">
        {items.map((item) => (
          <article key={item.id} className="surface-card flex items-start gap-4 p-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ice text-leaf">
              <Bell className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-800">{item.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
            </div>
          </article>
        ))}
      </section>
      {!items.length && !error && <EmptyState>No current workspace alerts were found.</EmptyState>}
    </div>
  );
}
