import { motion } from "framer-motion";
import { ArrowRight, BookOpenCheck, Calculator, CircleHelp } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ErrorState, SuccessState } from "../components/Feedback";
import { useWorkspace } from "../hooks/WorkspaceContext";
import { PageHeader } from "../components/PageHeader";
import { api } from "../services/api";
import type { Activity, Category, Factor } from "../types/api";

const categories: Array<{ value: Category; label: string }> = [
  { value: "electricity", label: "Electricity" },
  { value: "transport", label: "Transportation" },
  { value: "fuel", label: "Fuel" },
  { value: "waste", label: "Waste" },
];

function currentPeriod() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function ActivityPage() {
  const { auth } = useWorkspace();
  const accountType = auth?.user.account_type ?? "individual";
  const factorPath = `/${accountType}/factors`;
  const dashboardPath = `/${accountType}/dashboard`;
  const [category, setCategory] = useState<Category>("electricity");
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [unit, setUnit] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [period, setPeriod] = useState(currentPeriod);
  const [reportingUnit, setReportingUnit] = useState("");
  const [saved, setSaved] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingFactors, setLoadingFactors] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingFactors(true);
    setFactors([]);
    setFactorId("");
    setUnit("");
    api.getFactors(category)
      .then((result) => {
        if (active) setFactors(result);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Factors could not be loaded.");
      })
      .finally(() => {
        if (active) setLoadingFactors(false);
      });
    return () => { active = false; };
  }, [category]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(null);
    setSaving(true);
    try {
      const activity = await api.addActivity({
        category,
        description: description.trim(),
        quantity: Number(quantity),
        unit,
        period,
        reporting_unit: reportingUnit.trim(),
        factor_id: factorId,
      });
      setSaved(activity);
      setDescription("");
      setQuantity("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Activity could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const selectedFactor = factors.find((factor) => factor.id === factorId);
  const units = [...new Set(factors.map((factor) => factor.unit.split("/").pop() ?? ""))].filter(Boolean);

  return (
    <div>
      <PageHeader
        eyebrow="ACTIVITY REGISTER"
        title="Record the"
        highlight="real-world activity."
        description="Add utility use, travel, fuel, or waste. A calculation is saved only with a documented, unit-compatible factor."
      />
      {error && <div className="mb-4"><ErrorState message={error} /></div>}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <section className="surface-card p-5 sm:p-7">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-mint text-leaf"><Calculator className="h-5 w-5" /></span>
            <div><h2 className="text-sm font-semibold text-slate-800">New activity</h2><p className="mt-1 text-xs text-slate-400">The factor metadata is snapshotted with each result.</p></div>
          </div>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="form-label">Activity category
                <select className="form-input" value={category} onChange={(event) => setCategory(event.target.value as Category)}>
                  {categories.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="form-label">Reporting month
                <input className="form-input" type="month" required value={period} onChange={(event) => setPeriod(event.target.value)} />
              </label>
            </div>
            <label className="form-label">Description
              <input className="form-input" required minLength={2} maxLength={160} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Monthly electricity from utility bill" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="form-label">Activity quantity
                <input className="form-input" type="number" min="0.000001" max="1000000000" step="any" required value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Enter measured amount" />
              </label>
              <label className="form-label">Activity unit
                <select className="form-input" value={unit} onChange={(event) => setUnit(event.target.value)} required disabled={units.length === 0}>
                  <option value="">{units.length ? "Select compatible unit" : "No configured factor units"}</option>
                  {units.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            </div>
            <label className="form-label">Documented emission factor
              <select
                className="form-input"
                required
                value={factorId}
                disabled={loadingFactors || factors.length === 0}
                onChange={(event) => {
                  setFactorId(event.target.value);
                  const factor = factors.find((item) => item.id === event.target.value);
                  setUnit(factor?.unit.split("/").pop() ?? "");
                }}
              >
                <option value="">{loadingFactors ? "Loading factors…" : factors.length ? "Select a factor" : "No sourced factor for this category"}</option>
                {factors.map((factor) => <option key={factor.id} value={factor.id}>{factor.name} · {factor.value} {factor.unit}</option>)}
              </select>
            </label>
            <label className="form-label">Facility / department <span className="font-normal text-slate-400">(optional)</span>
              <input className="form-input" maxLength={120} value={reportingUnit} onChange={(event) => setReportingUnit(event.target.value)} placeholder="e.g. Library, hostel, or household" />
            </label>
            {factors.length === 0 && !loadingFactors && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" />
                There is no factor configured for {category}. Add a source-verified factor first; GreenTrack will not guess one.
                <Link to={factorPath} className="shrink-0 font-semibold underline">Add factor</Link>
              </p>
            )}
            {selectedFactor && (
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                <p className="font-semibold text-slate-700">{selectedFactor.source_name} · {selectedFactor.factor_year} · {selectedFactor.region}</p>
                <a className="text-leaf underline" href={selectedFactor.source_url} target="_blank" rel="noreferrer">View factor source</a>
                {selectedFactor.assumptions && <p className="mt-1 text-slate-500">{selectedFactor.assumptions}</p>}
              </div>
            )}
            <button type="submit" className="btn-primary justify-center" disabled={saving || loadingFactors || !factorId || !unit}>
              {saving ? "Calculating…" : "Calculate and save activity"} <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </section>

        <aside className="grid gap-4">
          <section className="surface-card p-5">
            <p className="text-[10px] font-bold tracking-[0.15em] text-leaf">CALCULATION METHOD</p>
            <h2 className="mt-2 text-xl font-semibold text-forest">Activity × factor</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Emissions (kg CO₂e) = measured activity quantity × selected emission factor.</p>
            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
              <p className="text-xs font-semibold text-emerald-800">Illustrative arithmetic</p>
              <p className="mt-1 text-sm font-medium text-slate-700">100 kWh × 0.8 kgCO₂e/kWh = 80 kgCO₂e</p>
              <p className="mt-2 text-[11px] leading-5 text-slate-500">Example only—not an official or recommended emission factor.</p>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">Each record retains the factor value, unit, source, year, region, assumptions, and the formula result.</p>
          </section>
          {saved && (
            <motion.section initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} className="surface-card p-5">
              <SuccessState message="Activity saved with a reproducible calculation." />
              <h2 className="mt-4 text-lg font-semibold text-forest">{saved.description}</h2>
              <p className="mt-2 text-sm text-slate-600">{saved.quantity} {saved.unit} × {saved.factor_value} {saved.factor_unit} = <strong>{saved.emissions_kg} kg CO₂e</strong></p>
              <p className="mt-2 text-xs text-slate-500">{saved.factor_source} · {saved.factor_year} · {saved.factor_region}</p>
              <a href={saved.factor_source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-leaf hover:underline">
                <BookOpenCheck className="h-3.5 w-3.5" /> Verify factor source
              </a>
              <Link to={dashboardPath} className="mt-4 block text-sm font-semibold text-leaf hover:underline">View dashboard →</Link>
            </motion.section>
          )}
        </aside>
      </div>
    </div>
  );
}
