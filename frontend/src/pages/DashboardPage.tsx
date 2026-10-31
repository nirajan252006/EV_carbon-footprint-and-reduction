import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Cpu,
  Download,
  Gauge,
  Plus,
  Radio,
  Sparkles,
  Trash2,
  TrendingDown,
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
import { useWorkspace } from "../hooks/WorkspaceContext";
import { api } from "../services/api";
import type {
  Activity,
  DashboardData,
  ExplainableIntelligence,
  IotLatestResponse,
} from "../types/api";

const CATEGORY_COLORS: Record<string, string> = {
  electricity: "#315C85",
  transport: "#7C9BB8",
  fuel: "#D8A441",
  waste: "#A6B2BF",
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
  const { auth } = useWorkspace();
  const accountType = auth?.user.account_type ?? "individual";
  const portalName = accountType === "college" ? "Campus" : accountType === "organization" ? "Organization" : "Personal";
  const [period, setPeriod] = useState(currentPeriod);
  const [data, setData] = useState<DashboardData | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [explainableAi, setExplainableAi] = useState<ExplainableIntelligence | null>(null);
  const [iotData, setIotData] = useState<IotLatestResponse | null>(null);
  const [simulatingIot, setSimulatingIot] = useState(false);
  const [targetInput, setTargetInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboard, records, , xAi, iot] = await Promise.all([
        api.getDashboard(period),
        api.getActivities(period),
        api.getRecommendations(period),
        api.getExplainableAi(period).catch(() => null),
        api.getIotLatest().catch(() => null),
      ]);
      setData(dashboard);
      setActivities(records);
      setExplainableAi(xAi);
      setIotData(iot);
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

  async function handleSimulateIot() {
    setSimulatingIot(true);
    setError(null);
    try {
      await api.simulateIot("esp32-meter-01");
      const updatedIot = await api.getIotLatest();
      setIotData(updatedIot);
      setNotice("Simulated ESP32 energy reading received & recorded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger IoT simulation.");
    } finally {
      setSimulatingIot(false);
    }
  }

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

  const iotStatus = iotData?.device_health.status ?? "offline";
  const latestReading = iotData?.latest_reading;

  return (
    <div>
      <PageHeader
        eyebrow={`${portalName.toUpperCase()} CARBON FOOTPRINT`}
        title={accountType === "individual" ? "Make your impact" : `Your ${portalName.toLowerCase()} emissions`}
        highlight={accountType === "individual" ? "visible and actionable." : "measured and traceable."}
        description={accountType === "college"
          ? "Review persisted campus activity, document factor sources, monitor IoT energy meters, and analyze explainable AI reduction intelligence."
          : accountType === "organization"
            ? "Review your organization's persisted activity, source-backed calculations, smart meters, and reduction targets."
            : "Track personal carbon emissions, electricity bills via OCR, and live IoT power monitoring with transparent formula traceability."}
        action={
          <div className="flex gap-2">
            <Link to={`/${accountType}/activity`} className="btn-primary">
              <Plus className="h-4 w-4" /> Add Activity / Bill
            </Link>
          </div>
        }
      />

      {/* Controls Bar */}
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
      {notice && <p role="status" className="mb-4 rounded-xl bg-ice p-3 text-sm text-blue-800 border border-blue-200">{notice}</p>}

      {/* KPI Cards */}
      {data && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="TOTAL CO₂e · THIS MONTH" value={`${number(data.total_kg)} kg`} note={`${data.activity_count} recorded ${data.activity_count === 1 ? "activity" : "activities"}`} icon={Gauge} />
          <MetricCard label="CATEGORY COVERAGE" value={`${data.categories.length} / 4`} note="Electricity, Transport, Fuel, Waste" icon={Zap} />
          <MetricCard
            label="PREVIOUS PERIOD"
            value={data.previous_total_kg > 0 ? `${number(data.previous_total_kg)} kg` : "—"}
            note={comparison === null ? "No positive prior baseline" : `${comparison <= 0 ? "Down" : "Up"} ${number(Math.abs(comparison))}% vs ${monthLabel(data.previous_period)}`}
            icon={comparison !== null && comparison < 0 ? ArrowDownRight : ArrowUpRight}
            positive={comparison !== null && comparison < 0}
          />
          <MetricCard
            label="MONTHLY TARGET"
            value={target === null ? "Not set" : `${number(target)} kg`}
            note={targetRatio === null ? "Set a workspace target" : `${number(targetRatio)}% of target used`}
            icon={TrendingUp}
            positive={targetRatio !== null && targetRatio <= 100}
          />
        </section>
      )}

      {/* IoT Household Energy & Environmental Monitor Section */}
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[#315C85]">
              <Cpu className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">IoT Household Energy & Environmental Monitor</h2>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    iotStatus === "online"
                      ? "bg-emerald-50 text-emerald-700"
                      : iotStatus === "stale"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      iotStatus === "online"
                        ? "animate-pulse bg-emerald-500"
                        : iotStatus === "stale"
                        ? "bg-amber-500"
                        : "bg-slate-400"
                    }`}
                  />
                  {iotStatus.toUpperCase()}
                </span>
                {latestReading?.is_simulated ? (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                    Simulated Mode
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {latestReading
                  ? `Device: ${latestReading.device_name ?? latestReading.device_id} · Reading: ${iotData?.device_health.reading_age_human}`
                  : "No microcontroller readings received yet. Connect your ESP32 or test with simulation."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSimulateIot}
            disabled={simulatingIot}
            className="btn-secondary text-xs"
            title="Inject an active simulated sensor reading for testing and hackathon demo"
          >
            <Radio className="h-3.5 w-3.5 text-blue-600" />
            {simulatingIot ? "Simulating…" : "Simulate IoT Meter Reading"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Instantaneous Power</span>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {latestReading ? `${number(latestReading.power)} W` : "0.0 W"}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Current load</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Voltage & Current</span>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {latestReading ? `${number(latestReading.voltage)} V` : "0.0 V"}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{latestReading ? `${number(latestReading.current)} A current` : "0.0 A"}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cumulative Meter Energy</span>
            <p className="mt-1 text-2xl font-bold text-[#315C85]">
              {latestReading ? `${number(latestReading.energy_kwh)} kWh` : "0.0 kWh"}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Total meter counter</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Environment Context</span>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {latestReading?.temperature !== null && latestReading?.temperature !== undefined
                ? `${latestReading.temperature}°C`
                : "—"}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {latestReading?.humidity !== null && latestReading?.humidity !== undefined
                ? `${latestReading.humidity}% Humidity`
                : "Contextual sensor"}
            </p>
          </div>
        </div>
      </section>

      {/* Explainable AI Carbon Intelligence Section */}
      {explainableAi && (
        <section className="mt-5 rounded-2xl border border-blue-200/80 bg-gradient-to-br from-white to-[#F6F9FD] p-5 shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-ice text-[#315C85]">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">Explainable AI Carbon Intelligence</h2>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                  {explainableAi.ai_generated ? "AI-Synthesized" : "Deterministic Math"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Transparent breakdown of what generated your footprint, why it matters, and mathematical reduction scenarios.
              </p>
            </div>
          </div>

          {/* Natural Language Synthesis */}
          <div className="mt-4 rounded-xl border border-blue-100 bg-white p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#315C85]">What Happened This Period?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">{explainableAi.what_happened}</p>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {/* Largest Contributor Breakdown */}
            {explainableAi.largest_contributor ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Primary Emissions Driver</span>
                <div className="mt-2 flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-bold capitalize text-slate-800">
                      {explainableAi.largest_contributor.category}
                    </h4>
                    <p className="text-xs text-slate-500">
                      {explainableAi.largest_contributor.percentage_of_total}% of total footprint
                    </p>
                  </div>
                  <strong className="text-xl font-bold text-[#315C85]">
                    {number(explainableAi.largest_contributor.emissions_kg)} kg CO₂e
                  </strong>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-600 bg-slate-50 rounded-lg p-2.5">
                  {explainableAi.largest_contributor.summary}
                </p>
              </div>
            ) : null}

            {/* Period-Over-Period Comparison */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Period-Over-Period Trend</span>
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <h4 className="text-base font-bold text-slate-800">
                    {explainableAi.period_comparison.has_prior_baseline
                      ? `${explainableAi.period_comparison.change_pct}% Change`
                      : "Baseline Period"}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {explainableAi.period_comparison.has_prior_baseline
                      ? `vs ${explainableAi.period_comparison.previous_period} (${explainableAi.period_comparison.previous_total_kg} kg)`
                      : "First measured reporting month"}
                  </p>
                </div>
                {explainableAi.period_comparison.change_pct !== null ? (
                  <span
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-bold ${
                      explainableAi.period_comparison.change_pct <= 0
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {explainableAi.period_comparison.change_pct <= 0 ? (
                      <TrendingDown className="h-4 w-4" />
                    ) : (
                      <TrendingUp className="h-4 w-4" />
                    )}
                    {Math.abs(explainableAi.period_comparison.change_pct)}%
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600 bg-slate-50 rounded-lg p-2.5">
                {explainableAi.period_comparison.note}
              </p>
            </div>
          </div>

          {/* Actionable Recommendations with Formulas */}
          {explainableAi.recommendations.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                Data-Grounded Reduction Opportunities
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                {explainableAi.recommendations.map((rec) => (
                  <div key={rec.category} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase text-leaf">{rec.category}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {rec.difficulty} Difficulty · {rec.priority} Priority
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-800">{rec.proposed_action}</p>
                    <p className="mt-1 text-xs text-slate-500">{rec.assumptions}</p>
                    <div className="mt-3 rounded-lg bg-emerald-50/70 p-2 text-xs font-semibold text-emerald-900">
                      Scenario Potential: Avoid {rec.estimated_avoided_kg} kg CO₂e ({rec.formula})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Calculation Formula Traces */}
          {explainableAi.activity_traces.length > 0 && (
            <div className="mt-5 border-t border-slate-200 pt-4">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                Formula Inspection & Factor Source Tracing
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {explainableAi.activity_traces.slice(0, 4).map((trace) => (
                  <div key={trace.id} className="rounded-xl border border-slate-200 bg-white p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-slate-800">{trace.description}</p>
                        <p className="text-[11px] capitalize text-slate-400">
                          {trace.category} · Origin: {trace.data_origin.replace(/_/g, " ")}
                        </p>
                      </div>
                      <strong className="text-xs font-bold text-[#315C85]">
                        {trace.emissions_kg} kg CO₂e
                      </strong>
                    </div>
                    <div className="mt-2 rounded-lg bg-slate-50 p-2 font-mono text-[11px] text-slate-700">
                      {trace.formula}
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      Factor: {trace.factor_name} ({trace.factor_value} {trace.factor_unit}) · {trace.factor_source}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Charts Section */}
      {data && (
        <>
          <section className="mt-5 grid gap-4 xl:grid-cols-2">
            <Panel title="Category Mix" subtitle="Calculated emissions for selected month">
              {data.categories.length ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.categories} dataKey="emissions_kg" nameKey="category" innerRadius={62} outerRadius={98} paddingAngle={4} stroke="none">
                        {data.categories.map((entry) => (
                          <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category] ?? "#315C85"} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${number(Number(value))} kg CO₂e`, "Emissions"]} />
                      <Legend formatter={(value: string) => value[0].toUpperCase() + value.slice(1)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState>No emissions recorded in {monthLabel(period)}.</EmptyState>
              )}
            </Panel>
            <Panel title="Monthly Trend" subtitle="Persisted monthly totals · kg CO₂e">
              {data.activity_count > 0 && data.trend.length ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.trend} margin={{ top: 16, right: 12, bottom: 3, left: 3 }}>
                      <CartesianGrid stroke="#E4E6E8" strokeDasharray="4 4" vertical={false} />
                      <XAxis dataKey="period" tickFormatter={monthLabel} tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} width={44} />
                      <Tooltip labelFormatter={(label) => monthLabel(String(label))} formatter={(value) => [`${number(Number(value))} kg CO₂e`, "Emissions"]} />
                      <Line type="monotone" dataKey="emissions_kg" name="Emissions" stroke="#315C85" strokeWidth={3} dot={{ r: 4, fill: "#315C85", strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState>No activity trend yet. Record activities or electricity bills to populate.</EmptyState>
              )}
            </Panel>
          </section>

          {/* Recent Activities Ledger */}
          <Panel title="Recent Activity Ledger" subtitle={`Saved records · ${monthLabel(period)}`} className="mt-5">
            {activities.length ? (
              <div className="divide-y divide-slate-100">
                {activities.slice(0, 10).map((activity) => (
                  <article key={activity.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-800">{activity.description}</p>
                        {activity.data_origin && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            {activity.data_origin.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs capitalize text-slate-400">
                        {activity.category} · {activity.quantity} {activity.unit}
                        {activity.reporting_unit ? ` · ${activity.reporting_unit}` : ""}
                      </p>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-sm font-semibold tabular-nums text-forest">{number(activity.emissions_kg)} kg CO₂e</p>
                      <a href={activity.factor_source_url} target="_blank" rel="noreferrer" className="text-[11px] text-leaf hover:underline">
                        {activity.factor_name} · {activity.factor_year}
                      </a>
                    </div>
                    <button
                      onClick={() => void removeActivity(activity)}
                      title="Delete activity"
                      aria-label={`Delete ${activity.description}`}
                      className="justify-self-end rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState>No activity records for this period. Add an electricity, transport, fuel, or waste record.</EmptyState>
            )}
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
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3, scale: 1.01 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="surface-card p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[9px] font-bold tracking-[0.13em] text-slate-400">{label}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${positive ? "bg-[#EAF0F6] text-[#315C85]" : "bg-slate-100 text-slate-500"}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-[#17233D]">{value}</p>
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
