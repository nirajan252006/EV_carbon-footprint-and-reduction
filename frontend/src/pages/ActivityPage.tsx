import { ArrowRight, Calculator } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ErrorState } from "../components/Feedback";
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

const fallbackUnits: Record<Category, string[]> = {
  electricity: ["kWh"],
  transport: ["km", "mi"],
  fuel: ["L", "gal"],
  waste: ["kg", "tonne"],
};

function factorActivityUnit(factor: Factor) {
  return factor.unit.includes("/") ? factor.unit.split("/").pop() ?? factor.unit : factor.unit;
}

function currentDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function ActivityPage() {
  const { auth } = useWorkspace();
  const accountType = auth?.user.account_type ?? "individual";
  const dashboardPath = `/${accountType}/dashboard`;
  const [category, setCategory] = useState<Category>("electricity");
  const [factors, setFactors] = useState<Factor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [unit, setUnit] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [activityDate, setActivityDate] = useState(currentDate);
  const period = activityDate.slice(0, 7);
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
    setError(null);
    api.getFactors(category)
      .then((result) => {
        if (!active) return;
        setFactors(result);
        const compatibleUnits = [...new Set(result.map(factorActivityUnit))];
        if (result.length === 1) {
          setFactorId(result[0].id);
          setUnit(factorActivityUnit(result[0]));
        } else if (compatibleUnits.length === 1) {
          const nextUnit = compatibleUnits[0];
          const matches = result.filter((factor) => factorActivityUnit(factor) === nextUnit);
          setUnit(nextUnit);
          if (matches.length === 1) setFactorId(matches[0].id);
        }
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
    if (saving || !saveEnabled) return;
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
        activity_date: activityDate,
        reporting_unit: reportingUnit.trim(),
        factor_id: factorId || null,
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
  const units = [...new Set([...factors.map(factorActivityUnit), ...fallbackUnits[category]])].filter(Boolean);
  const compatibleFactors = unit ? factors.filter((factor) => factorActivityUnit(factor) === unit) : [];
  const quantityNumber = Number(quantity);
  const validQuantity = Number.isFinite(quantityNumber) && quantityNumber > 0;
  const previewValid = validQuantity && unit !== "" && selectedFactor !== undefined
    && factorActivityUnit(selectedFactor) === unit && selectedFactor.category === category;
  const previewEmissions = previewValid ? quantityNumber * selectedFactor.value : null;
  const saveEnabled = !saving && !loadingFactors && validQuantity && unit !== "";

  return (
    <div>
      <PageHeader
        eyebrow="ACTIVITY REGISTER"
        title="Record campus activity"
        highlight=""
        description="Enter your activity details to calculate carbon emissions."
      />
      {error && <div className="mb-4"><ErrorState message={error} /></div>}
      <section className="surface-card mx-auto max-w-2xl p-5 sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><Calculator className="h-5 w-5" /></span>
          <h2 className="text-sm font-semibold text-slate-800">Activity details</h2>
        </div>
        <form onSubmit={submit} className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="form-label">Activity category *
              <select className="form-input" required value={category} onChange={(event) => { setCategory(event.target.value as Category); setFactorId(""); setUnit(""); setSaved(null); }}>
                {categories.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="form-label">Activity date *
              <input className="form-input" type="date" required value={activityDate} onChange={(event) => setActivityDate(event.target.value)} />
            </label>
          </div>
          <div className="text-xs text-slate-500">Reporting month: <span className="font-semibold text-slate-700">{period}</span></div>
          <label className="form-label">Description <span className="font-normal text-slate-400">(optional)</span>
            <input className="form-input" maxLength={160} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Short description of the activity" />
          </label>

          <div className="border-t border-slate-100 pt-5">
            <h3 className="mb-4 text-sm font-semibold text-slate-800">Measurement</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="form-label">Quantity *
                <input className="form-input" type="number" min="0.000001" max="1000000000" step="any" required value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Enter a positive amount" />
                {quantity !== "" && !validQuantity && <span className="mt-1 text-xs font-normal text-red-600">Enter a positive quantity.</span>}
              </label>
              <label className="form-label">Unit *
                {units.length > 0 ? (
                  <select className="form-input" value={unit} onChange={(event) => { const nextUnit = event.target.value; setUnit(nextUnit); const matches = factors.filter((factor) => factorActivityUnit(factor) === nextUnit); setFactorId(matches.length === 1 ? matches[0].id : ""); }} required>
                    <option value="">Select compatible unit</option>
                    {units.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                ) : (
                  <select className="form-input bg-slate-50" value="" disabled aria-label="Choose a unit">
                    <option value="">Choose an option</option>
                  </select>
                )}
              </label>
            </div>
            <label className="form-label mt-4">Department or facility <span className="font-normal text-slate-400">(optional)</span>
              <input className="form-input" maxLength={120} value={reportingUnit} onChange={(event) => setReportingUnit(event.target.value)} placeholder="e.g. Library" />
            </label>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <h3 className="mb-4 text-sm font-semibold text-slate-800">Emission factor</h3>
            {loadingFactors ? (
              <p className="text-sm text-slate-500">Loading verified factors…</p>
            ) : factors.length === 0 ? null : (
              <label className="form-label">Compatible emission factor
                <select className="form-input" required value={factorId} disabled={!unit || compatibleFactors.length === 0} onChange={(event) => setFactorId(event.target.value)}>
                  <option value="">{compatibleFactors.length ? "Select a factor" : "Select a compatible unit first"}</option>
                  {compatibleFactors.map((factor) => <option key={factor.id} value={factor.id}>{factor.name} — {factor.value} {factor.unit}</option>)}
                </select>
              </label>
            )}
            {selectedFactor && (
              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600">
                <p className="font-semibold text-slate-700">{selectedFactor.name}</p>
                <p>Source: {selectedFactor.source_name} · Year: {selectedFactor.factor_year} · Region: {selectedFactor.region}</p>
                <p>Unit: {selectedFactor.unit}</p>
                {selectedFactor.source_url && <a className="font-medium text-blue-700 underline" href={selectedFactor.source_url} target="_blank" rel="noreferrer">View source</a>}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Estimated emissions</p>
            {previewValid && previewEmissions !== null ? (
              <>
                <p className="mt-1 text-lg font-bold text-slate-900">{previewEmissions.toFixed(2)} kg CO₂e</p>
                <p className="mt-1 text-xs text-slate-600">Source: {selectedFactor?.source_name} · Year: {selectedFactor?.factor_year}</p>
                <p className="mt-1 text-[11px] text-slate-500">Preview only. Saved only when the activity is submitted.</p>
              </>
            ) : <p className="mt-1 text-sm text-slate-600">Select a verified factor and enter a quantity to see the estimate.</p>}
          </div>

          {saved && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <p className="font-semibold">Activity saved.</p>
              <p className="mt-1">{saved.quantity} {saved.unit} × {saved.factor_value} {saved.factor_unit} = {saved.emissions_kg.toFixed(2)} kg CO₂e saved.</p>
              <Link to={dashboardPath} className="mt-2 inline-block font-semibold text-blue-700 underline">View dashboard</Link>
            </div>
          )}
          <button type="submit" className="btn-primary justify-center" disabled={!saveEnabled}>
            {saving ? "Saving activity…" : "Calculate and save activity"} <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </section>
    </div>
  );
}
