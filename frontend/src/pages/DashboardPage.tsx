import { motion } from "framer-motion";
import {
  Activity as ActivityIcon,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
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
import CountUp from "react-countup";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
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
  electricity: "#42E695", // ecogreen
  transport: "#42C9FF",   // ecocyan
  fuel: "#F59E0B",        // amber
  waste: "#9B7BFF",       // ecoviolet
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
  return new Intl.DateTimeFormat(undefined, { month: "short", year: "2-digit" }).format(
    new Date(year, month - 1)
  );
}

export function DashboardPage() {
  const { auth } = useWorkspace();
  const accountType = auth?.user.account_type ?? "individual";
  const portalName =
    accountType === "college"
      ? "Campus"
      : accountType === "organization"
      ? "Organization"
      : "Personal";
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
      setNotice("Active simulated ESP32 energy reading received & recorded into persistent ledger.");
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
      setNotice("Monthly carbon target updated successfully.");
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

  if (loading && !data) return <LoadingState label="Computing emissions intelligence…" />;

  const comparison =
    data && data.previous_total_kg > 0
      ? ((data.total_kg - data.previous_total_kg) / data.previous_total_kg) * 100
      : null;
  const target = data?.monthly_target_kg ?? null;
  const targetRatio = target && data ? (data.total_kg / target) * 100 : null;

  const iotStatus = iotData?.device_health.status ?? "offline";
  const latestReading = iotData?.latest_reading;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={`${portalName} Carbon Intelligence`}
        title={accountType === "individual" ? "Autonomous footprint" : `${portalName} emissions`}
        highlight={accountType === "individual" ? "measured & explained." : "verified & optimized."}
        description={
          accountType === "college"
            ? "Inspect verified campus emissions, live smart energy monitors, OCR utility bills, and mathematical explainable AI reduction trajectories."
            : accountType === "organization"
            ? "Review cross-facility activities, hardware smart meters, deterministic emission factors, and institutional reduction scenarios."
            : "Monitor personal carbon impact with OCR electricity bill parsing, ESP32 IoT telemetry, and explainable AI insights with transparent formula proofs."
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/${accountType}/activity`} className="btn-primary">
              <Plus className="h-4 w-4" /> Add Activity / OCR Bill
            </Link>
          </div>
        }
      />

      {/* Floating Controls Bar */}
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-[#0D1B2A]/70">
        <label className="grid gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <span>Reporting Period</span>
          <input
            type="month"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            className="form-input min-w-44 text-xs"
          />
        </label>
        <div className="flex flex-wrap items-end gap-2.5">
          <form onSubmit={saveTarget} className="flex items-end gap-2">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <span>Carbon Budget (kg CO₂e)</span>
              <input
                type="number"
                min="0.001"
                step="any"
                value={targetInput}
                onChange={(event) => setTargetInput(event.target.value)}
                placeholder="Target limit"
                className="form-input w-36 text-xs"
              />
            </label>
            <button type="submit" className="btn-secondary h-10" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </form>
          <button
            type="button"
            className="btn-secondary h-10"
            onClick={exportReport}
            disabled={busy}
          >
            <Download className="h-4 w-4 text-emerald-600 dark:text-ecogreen" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-2">
          <ErrorState message={error} />
        </div>
      )}
      {notice && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs font-semibold text-emerald-800 dark:border-ecogreen/30 dark:bg-ecogreen/10 dark:text-ecogreen"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-ecogreen" />
          <span>{notice}</span>
        </motion.div>
      )}

      {/* KPI Stat Cards with Animated CountUp and Futuristic Styling */}
      {data && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Card 1: Total Footprint */}
          <div className="surface-card group relative overflow-hidden p-5 transition-all dark:hover:border-ecogreen/40 dark:hover:shadow-glow-green">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400 dark:from-ecogreen dark:to-ecoteal" />
            <div className="flex items-start justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Monthly Carbon Footprint
              </span>
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-ecogreen/15 dark:text-ecogreen">
                <Gauge className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                <CountUp end={data.total_kg} decimals={2} duration={1.2} separator="," preserveValue />
              </span>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">kg CO₂e</span>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Across {data.activity_count} verified {data.activity_count === 1 ? "activity" : "activities"}
            </p>
          </div>

          {/* Card 2: Category Coverage */}
          <div className="surface-card group relative overflow-hidden p-5 transition-all dark:hover:border-ecocyan/40 dark:hover:shadow-glow-cyan">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-500 dark:from-ecocyan dark:to-ecoblue" />
            <div className="flex items-start justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Category Scope
              </span>
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:bg-ecocyan/15 dark:text-ecocyan">
                <Zap className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                <CountUp end={data.categories.length} duration={0.8} />
              </span>
              <span className="text-sm font-bold text-slate-400">/ 4 sectors</span>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Electricity · Travel · Fuel · Waste
            </p>
          </div>

          {/* Card 3: Prior Period Comparison */}
          <div className="surface-card group relative overflow-hidden p-5 transition-all dark:hover:border-ecoviolet/40">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 to-purple-500 dark:from-ecoviolet dark:to-purple-400" />
            <div className="flex items-start justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Prior Period Shift
              </span>
              <div
                className={`grid h-8 w-8 place-items-center rounded-xl ${
                  comparison !== null && comparison <= 0
                    ? "bg-emerald-500/10 text-emerald-600 dark:bg-ecogreen/15 dark:text-ecogreen"
                    : "bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
                }`}
              >
                {comparison !== null && comparison <= 0 ? (
                  <ArrowDownRight className="h-4 w-4" />
                ) : (
                  <ArrowUpRight className="h-4 w-4" />
                )}
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              {comparison !== null ? (
                <>
                  <span
                    className={`text-3xl font-black tracking-tight ${
                      comparison <= 0
                        ? "text-emerald-600 dark:text-ecogreen"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {comparison <= 0 ? "" : "+"}
                    <CountUp end={comparison} decimals={1} duration={1.2} />%
                  </span>
                  <span className="text-xs font-medium text-slate-400">
                    vs {monthLabel(data.previous_period)}
                  </span>
                </>
              ) : (
                <span className="text-2xl font-bold text-slate-400">Baseline</span>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {data.previous_total_kg > 0
                ? `${number(data.previous_total_kg)} kg prior baseline`
                : "Initial reporting month recorded"}
            </p>
          </div>

          {/* Card 4: Monthly Budget / Target */}
          <div className="surface-card group relative overflow-hidden p-5 transition-all dark:hover:border-ecoblue/40">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-teal-500 dark:from-ecoblue dark:to-ecoteal" />
            <div className="flex items-start justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Budget Target Limit
              </span>
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-ecoblue/15 dark:text-ecoblue">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              {target !== null ? (
                <>
                  <span className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                    <CountUp end={target} decimals={0} duration={1} />
                  </span>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">kg cap</span>
                </>
              ) : (
                <span className="text-xl font-bold text-slate-400">Unconstrained</span>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {targetRatio !== null
                ? `${number(targetRatio)}% of budget utilized`
                : "Set a monthly target to track reduction goals"}
            </p>
          </div>
        </section>
      )}

      {/* IoT Household Energy & Environmental Monitor Panel */}
      <section className="surface-card relative overflow-hidden p-6 sm:p-7 dark:border-white/10 dark:bg-[#0D1B2A]/85">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/60 pb-5 dark:border-white/10">
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-cyan-600 dark:text-ecocyan border border-cyan-500/30">
                <Cpu className="h-6 w-6" />
              </div>
              {iotStatus === "online" && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4">
                  <span className="animate-radar-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 dark:bg-ecogreen border-2 border-white dark:border-darksurface" />
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  IoT Smart Meter & Hardware Telemetry
                </h2>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider ${
                    iotStatus === "online"
                      ? "bg-emerald-500/10 text-emerald-700 dark:bg-ecogreen/15 dark:text-ecogreen border border-emerald-500/30"
                      : iotStatus === "stale"
                      ? "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 border border-amber-500/30"
                      : "bg-slate-200/60 text-slate-600 dark:bg-white/10 dark:text-slate-400"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      iotStatus === "online"
                        ? "bg-emerald-500 dark:bg-ecogreen animate-pulse"
                        : iotStatus === "stale"
                        ? "bg-amber-500"
                        : "bg-slate-400"
                    }`}
                  />
                  {iotStatus.toUpperCase()}
                </span>
                {latestReading?.is_simulated ? (
                  <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:text-ecoviolet">
                    Microcontroller Simulation
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {latestReading
                  ? `Device: ${latestReading.device_name ?? latestReading.device_id} · Latency: ${
                      iotData?.device_health.reading_age_human
                    } · Stream: Active telemetry`
                  : "No microcontroller readings received yet. Connect your ESP32 or test with simulation."}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSimulateIot}
            disabled={simulatingIot}
            className="btn-secondary h-10 gap-2 border-emerald-500/30 text-xs text-emerald-700 hover:bg-emerald-50 dark:border-ecogreen/30 dark:text-ecogreen dark:hover:bg-ecogreen/10"
            title="Inject an active simulated sensor reading for testing and hackathon demo"
          >
            <Radio className="h-3.5 w-3.5 text-emerald-600 dark:text-ecogreen" />
            <span>{simulatingIot ? "Sampling Stream…" : "Simulate ESP32 Reading"}</span>
          </button>
        </div>

        {/* Real-time telemetry metrics */}
        <div className="mt-5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200/70 bg-white/60 p-4 backdrop-blur-sm dark:border-white/5 dark:bg-white/[0.02]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
              Instantaneous Power
            </span>
            <p className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
              <CountUp
                end={latestReading ? latestReading.power : 0}
                decimals={1}
                duration={1}
              />{" "}
              <span className="text-sm font-semibold text-slate-400">W</span>
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Active household draw
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/70 bg-white/60 p-4 backdrop-blur-sm dark:border-white/5 dark:bg-white/[0.02]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
              Grid Line Voltage & Current
            </span>
            <p className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
              {latestReading ? `${number(latestReading.voltage)} V` : "0.0 V"}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {latestReading ? `${number(latestReading.current)} A current load` : "0.0 A"}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/70 bg-white/60 p-4 backdrop-blur-sm dark:border-white/5 dark:bg-white/[0.02]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
              Cumulative Meter Energy
            </span>
            <p className="mt-1.5 text-2xl font-black text-emerald-600 dark:text-ecogreen">
              <CountUp
                end={latestReading ? latestReading.energy_kwh : 0}
                decimals={3}
                duration={1}
              />{" "}
              <span className="text-sm font-semibold text-slate-400">kWh</span>
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Consecutive delta meter counter
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/70 bg-white/60 p-4 backdrop-blur-sm dark:border-white/5 dark:bg-white/[0.02]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
              Environmental Sensor DHT
            </span>
            <p className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
              {latestReading?.temperature !== null && latestReading?.temperature !== undefined
                ? `${latestReading.temperature}°C`
                : "24.5°C"}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {latestReading?.humidity !== null && latestReading?.humidity !== undefined
                ? `${latestReading.humidity}% Relative Humidity`
                : "Ambient indoor sensor"}
            </p>
          </div>
        </div>
      </section>

      {/* Explainable AI Carbon Intelligence Section */}
      {explainableAi && (
        <section className="surface-card relative overflow-hidden p-6 sm:p-7 dark:border-white/10 dark:bg-[#0D1B2A]/85">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/60 pb-5 dark:border-white/10">
            <div className="flex items-center gap-3.5">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500/20 via-teal-500/20 to-cyan-500/20 text-emerald-600 dark:text-ecogreen border border-emerald-500/30">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Explainable AI Carbon Intelligence
                  </h2>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-ecogreen">
                    {explainableAi.ai_generated ? "Autonomous AI Synthesis" : "Deterministic Math Verification"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Transparent breakdown of activities, emission drivers, and verifiable mathematical reduction scenarios.
                </p>
              </div>
            </div>
          </div>

          {/* Natural Language Synthesis Briefing Card */}
          <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 sm:p-5 dark:border-ecogreen/20 dark:bg-ecogreen/5">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-ecogreen">
              <ActivityIcon className="h-4 w-4" /> Period Emissions Briefing
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {explainableAi.what_happened}
            </p>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {/* Primary Driver */}
            {explainableAi.largest_contributor ? (
              <div className="rounded-xl border border-slate-200/70 bg-white/70 p-4 backdrop-blur-sm dark:border-white/5 dark:bg-white/[0.02]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                  Dominant Emissions Driver
                </span>
                <div className="mt-2.5 flex items-center justify-between">
                  <div>
                    <h4 className="text-lg font-bold capitalize text-slate-900 dark:text-white">
                      {explainableAi.largest_contributor.category}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {explainableAi.largest_contributor.percentage_of_total}% of measured period footprint
                    </p>
                  </div>
                  <strong className="text-xl font-black text-emerald-600 dark:text-ecogreen">
                    {number(explainableAi.largest_contributor.emissions_kg)} kg CO₂e
                  </strong>
                </div>
                <p className="mt-3 rounded-lg bg-slate-100/70 p-3 text-xs leading-relaxed text-slate-600 dark:bg-white/[0.04] dark:text-slate-300">
                  {explainableAi.largest_contributor.summary}
                </p>
              </div>
            ) : null}

            {/* Period-Over-Period Comparison */}
            <div className="rounded-xl border border-slate-200/70 bg-white/70 p-4 backdrop-blur-sm dark:border-white/5 dark:bg-white/[0.02]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                Period-Over-Period Trend
              </span>
              <div className="mt-2.5 flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-bold text-slate-900 dark:text-white">
                    {explainableAi.period_comparison.has_prior_baseline
                      ? `${explainableAi.period_comparison.change_pct}% Shift`
                      : "Baseline Period"}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {explainableAi.period_comparison.has_prior_baseline
                      ? `vs ${explainableAi.period_comparison.previous_period} (${explainableAi.period_comparison.previous_total_kg} kg)`
                      : "First verified reporting month"}
                  </p>
                </div>
                {explainableAi.period_comparison.change_pct !== null ? (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-sm font-bold ${
                      explainableAi.period_comparison.change_pct <= 0
                        ? "bg-emerald-500/10 text-emerald-700 dark:bg-ecogreen/15 dark:text-ecogreen"
                        : "bg-rose-500/10 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400"
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
              <p className="mt-3 rounded-lg bg-slate-100/70 p-3 text-xs leading-relaxed text-slate-600 dark:bg-white/[0.04] dark:text-slate-300">
                {explainableAi.period_comparison.note}
              </p>
            </div>
          </div>

          {/* Actionable Recommendations with Formulas */}
          {explainableAi.recommendations.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Actionable Reduction Opportunities (Evidence-Grounded)
              </h3>
              <div className="grid gap-3.5 md:grid-cols-2">
                {explainableAi.recommendations.map((rec) => (
                  <div
                    key={rec.category}
                    className="rounded-xl border border-slate-200/70 bg-white/70 p-4 transition-all hover:-translate-y-0.5 dark:border-white/5 dark:bg-white/[0.02]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase text-emerald-600 dark:text-ecogreen">
                        {rec.category}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                        {rec.difficulty} Difficulty · {rec.priority} Priority
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-white">
                      {rec.proposed_action}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {rec.assumptions}
                    </p>
                    <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-xs font-semibold text-emerald-800 dark:border-ecogreen/30 dark:bg-ecogreen/15 dark:text-ecogreen">
                      Scenario Potential: Avoid {rec.estimated_avoided_kg} kg CO₂e ({rec.formula})
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Calculation Formula Traces */}
          {explainableAi.activity_traces.length > 0 && (
            <div className="mt-6 border-t border-slate-200/60 pt-5 dark:border-white/10">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Formula Inspection & Factor Source Tracing
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {explainableAi.activity_traces.slice(0, 4).map((trace) => (
                  <div
                    key={trace.id}
                    className="rounded-xl border border-slate-200/70 bg-white/70 p-3.5 backdrop-blur-sm dark:border-white/5 dark:bg-white/[0.02]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-white">
                          {trace.description}
                        </p>
                        <p className="text-[11px] capitalize text-slate-400">
                          {trace.category} · Origin: {trace.data_origin.replace(/_/g, " ")}
                        </p>
                      </div>
                      <strong className="text-xs font-bold text-emerald-600 dark:text-ecogreen">
                        {trace.emissions_kg} kg CO₂e
                      </strong>
                    </div>
                    <div className="mt-2 rounded-lg bg-slate-100 p-2 font-mono text-[11px] text-slate-700 dark:bg-black/30 dark:text-slate-200">
                      {trace.formula}
                    </div>
                    <p className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                      Factor: {trace.factor_name} ({trace.factor_value} {trace.factor_unit}) ·{" "}
                      {trace.factor_source}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Visual Analytics / Charts Section with Glowing Gradients */}
      {data && (
        <>
          <section className="grid gap-5 xl:grid-cols-2">
            {/* Category Mix Pie Chart */}
            <Panel
              title="Emissions Category Mix"
              subtitle={`Proportional breakdown · ${monthLabel(period)}`}
            >
              {data.categories.length ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.categories}
                        dataKey="emissions_kg"
                        nameKey="category"
                        innerRadius={65}
                        outerRadius={105}
                        paddingAngle={5}
                        stroke="none"
                      >
                        {data.categories.map((entry) => (
                          <Cell
                            key={entry.category}
                            fill={CATEGORY_COLORS[entry.category] ?? "#42E695"}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0D1B2A",
                          borderColor: "rgba(255,255,255,0.1)",
                          borderRadius: "12px",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                        formatter={(value) => [`${number(Number(value))} kg CO₂e`, "Emissions"]}
                      />
                      <Legend
                        formatter={(value: string) => (
                          <span className="text-xs capitalize font-medium text-slate-600 dark:text-slate-300">
                            {value}
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState>No emissions recorded in {monthLabel(period)}.</EmptyState>
              )}
            </Panel>

            {/* Monthly Trend Area Chart */}
            <Panel
              title="Emissions Trajectory Trend"
              subtitle="Persisted historical monthly totals · kg CO₂e"
            >
              {data.activity_count > 0 && data.trend.length ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={data.trend}
                      margin={{ top: 16, right: 12, bottom: 3, left: 3 }}
                    >
                      <defs>
                        <linearGradient id="emissionsGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#42E695" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#42E695" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        stroke="rgba(150, 150, 150, 0.15)"
                        strokeDasharray="4 4"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="period"
                        tickFormatter={monthLabel}
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        stroke="#94A3B8"
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        width={44}
                        stroke="#94A3B8"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0D1B2A",
                          borderColor: "rgba(255,255,255,0.1)",
                          borderRadius: "12px",
                          color: "#fff",
                          fontSize: "12px",
                        }}
                        labelFormatter={(label) => monthLabel(String(label))}
                        formatter={(value) => [`${number(Number(value))} kg CO₂e`, "Emissions"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="emissions_kg"
                        name="Emissions"
                        stroke="#42E695"
                        strokeWidth={3}
                        fill="url(#emissionsGradient)"
                        dot={{ r: 4, fill: "#42E695", strokeWidth: 2, stroke: "#07111F" }}
                        activeDot={{ r: 6, fill: "#20D6C7" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState>No historical activity trend yet. Record activities or bills to populate.</EmptyState>
              )}
            </Panel>
          </section>

          {/* Recent Activities Ledger */}
          <Panel
            title="Activity Ledger & Source Verification"
            subtitle={`Verified records · ${monthLabel(period)}`}
          >
            {activities.length ? (
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {activities.slice(0, 10).map((activity) => (
                  <article
                    key={activity.id}
                    className="grid gap-2 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-800 dark:text-white">
                          {activity.description}
                        </p>
                        {activity.data_origin && (
                          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:border-white/10 dark:bg-white/10 dark:text-slate-300">
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
                      <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-ecogreen">
                        {number(activity.emissions_kg)} kg CO₂e
                      </p>
                      <a
                        href={activity.factor_source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-teal-600 hover:underline dark:text-ecoteal"
                      >
                        {activity.factor_name} · {activity.factor_year}
                      </a>
                    </div>
                    <button
                      onClick={() => void removeActivity(activity)}
                      title="Delete activity"
                      aria-label={`Delete ${activity.description}`}
                      className="justify-self-end rounded-xl p-2 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
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

function Panel({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`surface-card min-w-0 p-5 sm:p-6 dark:border-white/10 dark:bg-[#0D1B2A]/85 ${className}`}>
      <header className="mb-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}
