import { motion } from "framer-motion";
import { ExternalLink, FilePlus2, Info } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { EmptyState, ErrorState, LoadingState } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { api } from "../services/api";
import type { Category, Factor } from "../types/api";

const categories: Array<{ value: Category; label: string }> = [
  { value: "electricity", label: "Electricity" },
  { value: "transport", label: "Transportation" },
  { value: "fuel", label: "Fuel" },
  { value: "waste", label: "Waste" },
];

export function FactorsPage() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("electricity");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [region, setRegion] = useState("India");
  const [assumptions, setAssumptions] = useState("");

  async function loadFactors() {
    setError(null);
    try {
      setFactors(await api.getFactors());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Factors could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFactors();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.addFactor({
        category,
        name: name.trim(),
        value: Number(value),
        unit: unit.trim(),
        source_name: sourceName.trim(),
        source_url: sourceUrl.trim(),
        factor_year: Number(year),
        region: region.trim(),
        assumptions: assumptions.trim(),
      });
      setName("");
      setValue("");
      setUnit("");
      setSourceName("");
      setSourceUrl("");
      setAssumptions("");
      await loadFactors();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Factor could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="EMISSION FACTOR REGISTER"
        title="Document the basis"
        highlight="of every estimate."
        description="A factor is usable only with its unit and provenance. Choose authoritative values that apply to the region, year, and activity boundary."
      />
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <Info className="mt-0.5 h-5 w-5 shrink-0" />
        <p>No factors are preloaded because the repository does not include a verified, region-specific factor dataset. Add a factor only after checking its original publication. The app does not label user-entered values as independently verified.</p>
      </div>
      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]">
        <section className="surface-card p-5 sm:p-7">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-mint text-leaf"><FilePlus2 className="h-5 w-5" /></span>
            <div><h2 className="text-sm font-semibold text-slate-800">Add an emission factor</h2><p className="mt-1 text-xs text-slate-400">Keep source year, region, and assumptions with the value.</p></div>
          </div>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="form-label">Category
                <select className="form-input" value={category} onChange={(event) => setCategory(event.target.value as Category)}>
                  {categories.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="form-label">Factor name
                <input className="form-input" required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Regional grid average" />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="form-label">Factor value
                <input className="form-input" type="number" min="0" max="1000000" step="any" required value={value} onChange={(event) => setValue(event.target.value)} />
              </label>
              <label className="form-label">Factor unit
                <input className="form-input" required pattern="kgCO2e/.+" title="Use kgCO2e per activity unit, e.g. kgCO2e/kWh" value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="kgCO2e/kWh" />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="form-label">Publication / source name
                <input className="form-input" required minLength={2} maxLength={160} value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="Official source or factor dataset" />
              </label>
              <label className="form-label">Factor year
                <input className="form-input" type="number" min="1900" max="2100" required value={year} onChange={(event) => setYear(event.target.value)} />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="form-label">Applicable region
                <input className="form-input" required minLength={2} maxLength={120} value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Country, state, or grid region" />
              </label>
              <label className="form-label">Source URL
                <input className="form-input" type="url" required maxLength={2000} value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" />
              </label>
            </div>
            <label className="form-label">Assumptions / limitations <span className="font-normal text-slate-400">(optional)</span>
              <textarea className="form-input min-h-24 resize-y" maxLength={1000} value={assumptions} onChange={(event) => setAssumptions(event.target.value)} placeholder="Boundary, technology, geography, or other caveats" />
            </label>
            <button type="submit" className="btn-primary justify-center" disabled={saving}>{saving ? "Saving factor…" : "Save documented factor"}</button>
          </form>
        </section>

        <section className="surface-card p-5 sm:p-7">
          <header className="mb-4 flex items-end justify-between gap-3">
            <div><h2 className="text-sm font-semibold text-slate-800">Available factors</h2><p className="mt-1 text-xs text-slate-400">{factors.length} factor{factors.length === 1 ? "" : "s"}  ·  sources saved with each calculation</p></div>
          </header>
          {loading ? <LoadingState label="Loading factor register…" /> : factors.length ? (
            <div className="grid gap-3">
              {factors.map((factor, index) => (
                <motion.article key={factor.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.025 }} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><h3 className="text-sm font-semibold text-slate-800">{factor.name}</h3><p className="mt-1 text-xs capitalize text-slate-400">{factor.category}  ·  {factor.region}  ·  {factor.factor_year}</p></div>
                    <strong className="rounded-lg bg-mint px-2.5 py-1.5 text-xs font-semibold text-leaf">{factor.value} {factor.unit}</strong>
                  </div>
                  <a href={factor.source_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-leaf hover:underline">
                    {factor.source_name}<ExternalLink className="h-3 w-3" />
                  </a>
                  {factor.assumptions && <p className="mt-2 text-xs leading-5 text-slate-500">{factor.assumptions}</p>}
                </motion.article>
              ))}
            </div>
          ) : <EmptyState>No factors registered. Add a source-backed factor before logging activity.</EmptyState>}
        </section>
      </div>
    </div>
  );
}
