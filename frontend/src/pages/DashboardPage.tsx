import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Download,
  Gauge,
  Plus,
  Sparkles,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState, ErrorState, LoadingState } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { api } from "../services/api";
import type { Activity, DashboardData, Recommendation } from "../types/api";

const CATEGORY_COLORS: Record<string, string> = {
  electricity: "#168052",
  transport: "#4b8fc1",
  fuel: "#d18b3b",
  waste: "#8c78bd",
};

function currentPeriod() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function number(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit" }).format(new Date(year, month - 1));
}

export function DashboardPage() {
  const [period, setPeriod] = useState(currentPeriod);
  const [data, setData] = useState<DashboardData | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [targetInput, setTargetInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboard, records, tips] = await Promise.all([
        api.getDashboard(period),
        api.getActivities(period),
        api.getRecommendations(period),
      ]);
      setData(dashboard);
      setActivities(records);
      setRecommendations(tips);
      setTargetInput(dashboard.monthly_target_kg?.toString() ?? "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Dashboard data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveTarget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await api.setTarget(targetInput ? Number(targetInput) : null);
      setNotice("Monthly emissions target saved.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Target could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function exportReport() {
    setBusy(true);
    setError(null);
    try {
      const blob = await api.report(period);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `greentrack-${period}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Report could not be downloaded.");
    } finally {
      setBusy(false);
    }
  }

  async function removeActivity(activity: Activity) {
    if (!window.confirm(`Delete "${activity.description}"?`)) return;
    setError(null);
    try {
      await api.deleteActivity(activity.id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Activity could not be deleted.");
    }
  }

  if (loading && !data) return <LoadingState label="Loading your measured footprint…" />;

  const comparison = data && data.previous_total_kg > 0
    ? ((data.total_kg - data.previous_total_kg) / data.previous_total_kg) * 100
    : null;
  const target = data?.monthly_target_kg ?? null;
  const targetRatio = target && data ? (data.total_kg / target) * 100 : null;

  return (
    <div>
      <PageHeader
        eyebrow="CARBON FOOTPRINT OVERVIEW"
        title="Make your impact"
        highlight="visible and actionable."
        description="Track measured activity and documented emissions factors. No default factor is silently assumed."
        action={
          <Link to="/activity" className="btn-primary">
            <Plus className="h-4 w-4" /> Add activity
          </Link>
        }
      />

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <label className="grid gap-1.5 text-xs font-medium text-slate-500">
          Reporting month
          <input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="form-input min-w-40" />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <form onSubmit={saveTarget} className="flex items-end gap-2">
            <label className="grid gap-1.5 text-xs font-medium text-slate-500">
              Monthly target (kg CO₂e)
              <input type="number" min="0.001" step="any" value={targetInput} onChange={(event) => setTargetInput(event.target.value)} placeholder="Optional" className="form-input w-40" />
            </label>
            <button type="submit" className="btn-secondary" disabled={busy}>{busy ? "Saving…" : "Save target"}</button>
          </form>
          <button type="button" className="btn-secondary" onClick={exportReport} disabled={busy}>
            <Download className="h-4 w-4" /> CSV report
          </button>
        </div>
      </div>

      {error && <div className="mb-4"><ErrorState message={error} /></div>}
      {notice && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}

      {!data?.categories.length && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div>
            <p className="text-sm font-semibold text-amber-900">Start with a sourced emission factor</p>
            <p className="mt-1 text-xs text-amber-800">Activity is not estimated until a category and unit-matched factor is available.</p>
          </div>
          <Link to="/factors" className="btn-secondary border-amber-300 bg-white">Configure factors <ArrowUpRight className="h-4 w-4" /></Link>
        </div>
      )}

      {data && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="TOTAL CO₂e · THIS MONTH" value={`${number(data.total_kg)} kg`} note={`${data.activity_count} recorded ${data.activity_count === 1 ? "activity" : "activities"}`} icon={Gauge} />
            <MetricCard label="CATEGORY COVERAGE" value={`${data.categories.length} / 4`} note="Categories with recorded emissions" icon={Zap} />
            <MetricCard
              label="PREVIOUS PERIOD"
              value={data.previous_total_kg > 0 ? `${number(data.previous_total_kg)} kg` : "—"}
              note={comparison === null ? "No positive prior-period baseline" : `${comparison <= 0 ? "Down" : "Up"} ${number(Math.abs(comparison))}% vs ${monthLabel(data.previous_period)}`}
              icon={comparison !== null && comparison < 0 ? ArrowDownRight : ArrowUpRight}
              positive={comparison !== null && comparison < 0}
            />
            <MetricCard
              label="MONTHLY EMISSIONS TARGET"
              value={target === null ? "Not set" : `${number(target)} kg`}
              note={targetRatio === null ? "Set a workspace target" : `${number(targetRatio)}% of target used`}
              icon={TrendingUp}
              positive={targetRatio !== null && targetRatio <= 100}
            />
          </section>

          {loading && <div className="mt-4"><LoadingState label="Updating selected month…" /></div>}

          <section className="mt-4 grid gap-4 xl:grid-cols-2">
            <Panel title="Category mix" subtitle="Calculated emissions for selected month">
              {data.categories.length ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.categories} dataKey="emissions_kg" nameKey="category" innerRadius={62} outerRadius={98} paddingAngle={4} stroke="none">
                        {data.categories.map((entry) => <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category]} />)}
                      </Pie>
                      <Tooltip formatter={(value) => [`${number(Number(value))} kg CO₂e`, "Emissions"]} />
                      <Legend formatter={(value: string) => value[0].toUpperCase() + value.slice(1)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyState>No emissions recorded in {monthLabel(period)}.</EmptyState>}
            </Panel>
            <Panel title="Six-month trend" subtitle="Persisted monthly totals · kg CO₂e">
              {data.trend.length ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.trend} margin={{ top: 16, right: 12, bottom: 3, left: 3 }}>
                      <CartesianGrid stroke="#edf1ee" strokeDasharray="4 4" vertical={false} />
                      <XAxis dataKey="period" tickFormatter={monthLabel} tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} width={44} />
                      <Tooltip labelFormatter={(label) => monthLabel(String(label))} formatter={(value) => [`${number(Number(value))} kg CO₂e`, "Emissions"]} />
                      <Line type="monotone" dataKey="emissions_kg" name="Emissions" stroke="#168052" strokeWidth={3} dot={{ r: 4, fill: "#168052", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : <EmptyState>Add activity to begin a trend.</EmptyState>}
            </Panel>
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-2">
            <Panel title="Largest contributors" subtitle="Ranked from recorded calculations">
              {data.contributors.length ? (
                <div className="divide-y divide-slate-100">
                  {data.contributors.map((item, index) => (
                    <div className="flex items-center gap-3 py-3" key={item.id}>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-mint text-xs font-bold text-leaf">{String(index + 1).padStart(2, "0")}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-700">{item.description}</p>
                        <p className="mt-0.5 text-xs capitalize text-slate-400">{item.category} {item.reporting_unit ? `· ${item.reporting_unit}` : ""}</p>
                      </div>
                      <strong className="text-sm tabular-nums text-forest">{number(item.emissions_kg)} kg</strong>
                    </div>
                  ))}
                </div>
              ) : <EmptyState>No contributors in this reporting period.</EmptyState>}
            </Panel>
            <Panel title="Practical next steps" subtitle="Rules-based prompts · no unsupported savings claims">
              {recommendations.length ? (
                <div className="grid gap-3">
                  {recommendations.map((item) => (
                    <motion.article key={item.category} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                      <p className="flex items-center gap-2 text-sm font-semibold capitalize text-leaf"><Sparkles className="h-4 w-4" />{item.category}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.reason}</p>
                      <p className="mt-2 text-sm leading-5 text-slate-700">{item.action}</p>
                    </motion.article>
                  ))}
                </div>
              ) : <EmptyState>Recommendations appear after activity has been measured.</EmptyState>}
            </Panel>
          </section>

          <Panel title="Recent activity" subtitle={`Saved records · ${monthLabel(period)}`} className="mt-4">
            {activities.length ? (
              <div className="divide-y divide-slate-100">
                {activities.slice(0, 8).map((activity) => (
                  <article key={activity.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">{activity.description}</p>
                      <p className="mt-0.5 text-xs capitalize text-slate-400">{activity.category} · {activity.quantity} {activity.unit}{activity.reporting_unit ? ` · ${activity.reporting_unit}` : ""}</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-sm font-semibold tabular-nums text-forest">{number(activity.emissions_kg)} kg CO₂e</p>
                      <a href={activity.factor_source_url} target="_blank" rel="noreferrer" className="text-[11px] text-leaf hover:underline">
                        {activity.factor_name} · {activity.factor_year}
                      </a>
                    </div>
                    <button onClick={() => void removeActivity(activity)} title="Delete activity" aria-label={`Delete ${activity.description}`} className="justify-self-end rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </article>
                ))}
              </div>
            ) : <EmptyState>No activity records for this period. Add an electricity, trip, fuel, or waste record.</EmptyState>}
          </Panel>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  positive = false,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof Gauge;
  positive?: boolean;
}) {
  return (
    <motion.article initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} className="surface-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[9px] font-bold tracking-[0.13em] text-slate-400">{label}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${positive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-forest">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{note}</p>
    </motion.article>
  );
}

function Panel({ title, subtitle, children, className = "" }: { title: string; subtitle: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`surface-card min-w-0 p-4 sm:p-5 ${className}`}>
      <header className="mb-4">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}
