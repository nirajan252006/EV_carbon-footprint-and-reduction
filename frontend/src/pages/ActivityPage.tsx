import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  FileUp,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ErrorState } from "../components/Feedback";
import { useWorkspace } from "../hooks/WorkspaceContext";
import { PageHeader } from "../components/PageHeader";
import { api } from "../services/api";
import type { Activity, BillExtractionResult, Category, Factor } from "../types/api";

const categories: Array<{ value: Category; label: string }> = [
  { value: "electricity", label: "Electricity" },
  { value: "transport", label: "Transportation" },
  { value: "fuel", label: "Fuel" },
  { value: "waste", label: "Waste" },
];

function factorActivityUnit(factor: Factor) {
  return factor.unit.includes("/") ? factor.unit.split("/").pop() ?? factor.unit : factor.unit;
}

function currentDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

export function ActivityPage() {
  const { auth } = useWorkspace();
  const accountType = auth?.user.account_type ?? "individual";
  const dashboardPath = `/${accountType}/dashboard`;

  const [activeTab, setActiveTab] = useState<"manual" | "bill_ocr">("manual");

  // Manual Form States
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
  const [seeding, setSeeding] = useState(false);
  const [seedNotice, setSeedNotice] = useState<string | null>(null);

  // Bill OCR States
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [billFile, setBillFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [analyzingBill, setAnalyzingBill] = useState(false);
  const [billResult, setBillResult] = useState<BillExtractionResult | null>(null);
  const [confirmedKwh, setConfirmedKwh] = useState("");
  const [confirmedPeriod, setConfirmedPeriod] = useState(period);
  const [billDescription, setBillDescription] = useState("Electricity bill consumption");
  const [billReportingUnit, setBillReportingUnit] = useState("");
  const [savingBillActivity, setSavingBillActivity] = useState(false);
  const [billSavedActivity, setBillSavedActivity] = useState<Activity | null>(null);
  const [billError, setBillError] = useState<string | null>(null);

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
          if (matches.length === 1) {
            setFactorId(matches[0].id);
          }
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Emission factors could not be loaded.");
      })
      .finally(() => {
        if (active) setLoadingFactors(false);
      });
    return () => {
      active = false;
    };
  }, [category]);

  async function handleSeedFactors() {
    setSeeding(true);
    setError(null);
    try {
      const seeded = await api.seedFactors();
      setSeedNotice(`Standard emission factors initialized: ${seeded.seeded_factors_count} reference values ready.`);
      const currentCategoryFactors = await api.getFactors(category);
      setFactors(currentCategoryFactors);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seed reference factors.");
    } finally {
      setSeeding(false);
    }
  }

  async function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!description.trim() || !quantity || Number(quantity) <= 0) return;
    setSaving(true);
    setError(null);
    setSaved(null);
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
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Activity could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function onBillFileSelected(file: File) {
    setBillFile(file);
    setBillResult(null);
    setBillSavedActivity(null);
    setBillError(null);

    // Validate size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setBillError("File exceeds the 10 MB limit.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setAnalyzingBill(true);
    try {
      const result = await api.analyzeBill(formData);
      setBillResult(result);
      if (result.extracted_consumption !== null) {
        setConfirmedKwh(String(result.extracted_consumption));
      }
      if (result.billing_period) {
        setConfirmedPeriod(result.billing_period);
      }
    } catch (err) {
      setBillError(err instanceof Error ? err.message : "Failed to analyze electricity bill.");
    } finally {
      setAnalyzingBill(false);
    }
  }

  async function submitBillConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const kwhNum = Number(confirmedKwh);
    if (!kwhNum || kwhNum <= 0) {
      setBillError("Please enter a valid positive electricity consumption in kWh.");
      return;
    }
    setSavingBillActivity(true);
    setBillError(null);
    try {
      const act = await api.calculateElectricity({
        quantity: kwhNum,
        period: confirmedPeriod,
        description: billDescription.trim() || `Electricity Bill (${confirmedPeriod})`,
        reporting_unit: billReportingUnit.trim(),
      });
      setBillSavedActivity(act);
    } catch (err) {
      setBillError(err instanceof Error ? err.message : "Could not confirm electricity bill calculation.");
    } finally {
      setSavingBillActivity(false);
    }
  }

  const units = [...new Set(factors.map(factorActivityUnit))];
  const compatibleFactors = factors.filter((factor) => !unit || factorActivityUnit(factor) === unit);
  const selectedFactor = factors.find((factor) => factor.id === factorId) ?? null;
  const numQuantity = Number(quantity);
  const validQuantity = quantity !== "" && Number.isFinite(numQuantity) && numQuantity > 0;
  const previewValid = validQuantity && selectedFactor !== null && unit === factorActivityUnit(selectedFactor);
  const previewEmissions = previewValid && selectedFactor ? numQuantity * selectedFactor.value : null;
  const saveEnabled = validQuantity && (!factors.length || factorId !== "");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Measurement & Ingestion"
        title="Record carbon"
        highlight="emissions."
        description="Log carbon emissions across Electricity, Transport, Fuel, and Waste with verified emission factor tracing, or parse utility bills automatically via OCR."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSeedFactors}
              disabled={seeding}
              className="btn-secondary text-xs"
              title="Initialize standard CEA Grid, EPA Fuel, DEFRA Transport, and WARM Waste factors"
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-ecogreen" />
              <span>{seeding ? "Initializing…" : "Initialize Reference Factors"}</span>
            </button>
            <Link to={dashboardPath} className="btn-secondary text-xs">
              View Dashboard
            </Link>
          </div>
        }
      />

      {seedNotice && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-medium text-emerald-900 dark:border-ecogreen/30 dark:bg-ecogreen/10 dark:text-ecogreen">
          <span>{seedNotice}</span>
          <button onClick={() => setSeedNotice(null)} className="text-emerald-700 hover:text-emerald-900 dark:text-ecogreen">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <ErrorState message={error} />
        </div>
      )}

      {/* Mode Navigation Tabs */}
      <div className="flex border-b border-slate-200/80 dark:border-white/10">
        <button
          type="button"
          onClick={() => setActiveTab("manual")}
          className={`flex items-center gap-2 border-b-2 px-6 py-3.5 text-sm font-semibold transition-all ${
            activeTab === "manual"
              ? "border-emerald-500 text-emerald-800 dark:border-ecogreen dark:text-ecogreen"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          <Calculator className="h-4 w-4" />
          <span>Manual Activity Entry</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("bill_ocr")}
          className={`flex items-center gap-2 border-b-2 px-6 py-3.5 text-sm font-semibold transition-all ${
            activeTab === "bill_ocr"
              ? "border-emerald-500 text-emerald-800 dark:border-ecogreen dark:text-ecogreen"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
          }`}
        >
          <FileUp className="h-4 w-4" />
          <span>Electricity Bill OCR Upload</span>
        </button>
      </div>

      {activeTab === "bill_ocr" ? (
        /* Bill OCR Upload Workflow */
        <section className="grid gap-6 lg:grid-cols-[1fr_390px]">
          <div className="surface-card p-6 sm:p-7 dark:border-white/10 dark:bg-[#0D1B2A]/85">
            <div className="mb-5">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Electricity Bill Scanner & Parser
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Upload your utility electricity bill (PDF, JPG, PNG up to 10 MB). The system detects billed units (kWh),
                billing period, and isolates meter readings from tariffs.
              </p>
            </div>

            {billError && (
              <div className="mb-4">
                <ErrorState message={billError} />
              </div>
            )}

            {/* Drag & Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.[0]) onBillFileSelected(e.dataTransfer.files[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
                dragOver
                  ? "border-emerald-500 bg-emerald-500/10 dark:border-ecogreen dark:bg-ecogreen/15"
                  : "border-slate-300 bg-white/50 hover:border-emerald-400 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-ecogreen/40 dark:hover:bg-white/[0.04]"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.bmp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) onBillFileSelected(e.target.files[0]);
                }}
              />
              <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 text-emerald-600 dark:text-ecogreen border border-emerald-500/30">
                {analyzingBill ? (
                  <RefreshCw className="h-6 w-6 animate-spin" />
                ) : (
                  <Upload className="h-6 w-6" />
                )}
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-white">
                {analyzingBill
                  ? "Analyzing document text & parsing kWh…"
                  : billFile
                  ? billFile.name
                  : "Click to select or drag and drop your utility bill"}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Supports digital PDFs, scanned documents, and bill photos (up to 10 MB)
              </p>
            </div>

            {/* Extraction Results */}
            {billResult && (
              <div className="mt-6 rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.02]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-white/5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-ecogreen" />
                    <span className="text-sm font-bold text-slate-800 dark:text-white">
                      Document Extraction Results
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-700 dark:bg-white/10 dark:text-slate-300">
                      Engine: {billResult.engine_used.replace(/_/g, " ")}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-bold ${
                        billResult.confidence >= 0.85
                          ? "bg-emerald-500/10 text-emerald-700 dark:bg-ecogreen/15 dark:text-ecogreen"
                          : "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                      }`}
                    >
                      {Math.round(billResult.confidence * 100)}% Confidence
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-100/60 p-3.5 dark:bg-white/[0.03]">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Extracted Consumption</p>
                    <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                      {billResult.extracted_consumption !== null
                        ? `${billResult.extracted_consumption} kWh`
                        : "Ambiguous / Manual Entry Needed"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-100/60 p-3.5 dark:bg-white/[0.03]">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Detected Period</p>
                    <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                      {billResult.billing_period || "Current Month"}
                    </p>
                  </div>
                </div>

                {billResult.evidence && billResult.evidence.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Evidence from Document Text:
                    </p>
                    <ul className="mt-1.5 space-y-1 rounded-xl bg-slate-100/60 p-3 text-xs text-slate-700 font-mono dark:bg-black/30 dark:text-slate-300">
                      {billResult.evidence.map((snippet, idx) => (
                        <li key={idx} className="truncate">
                          • {snippet}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Confirmation Form */}
          <div className="surface-card p-6 sm:p-7 dark:border-white/10 dark:bg-[#0D1B2A]/85">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Verify & Save Emissions</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Review and adjust the extracted figures before recording to the ledger.
            </p>

            <form onSubmit={submitBillConfirmation} className="mt-5 space-y-4">
              <label className="form-label">
                Consumption (kWh) *
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  value={confirmedKwh}
                  onChange={(e) => setConfirmedKwh(e.target.value)}
                  placeholder="e.g. 350.0"
                  className="form-input"
                />
              </label>

              <label className="form-label">
                Billing Month (YYYY-MM) *
                <input
                  type="month"
                  required
                  value={confirmedPeriod}
                  onChange={(e) => setConfirmedPeriod(e.target.value)}
                  className="form-input"
                />
              </label>

              <label className="form-label">
                Description
                <input
                  type="text"
                  value={billDescription}
                  onChange={(e) => setBillDescription(e.target.value)}
                  placeholder="e.g. Household electricity bill"
                  className="form-input"
                />
              </label>

              <label className="form-label">
                Facility / Department (Optional)
                <input
                  type="text"
                  value={billReportingUnit}
                  onChange={(e) => setBillReportingUnit(e.target.value)}
                  placeholder="e.g. Home, Main Campus"
                  className="form-input"
                />
              </label>

              {billSavedActivity && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-900 dark:border-ecogreen/30 dark:bg-ecogreen/15 dark:text-ecogreen">
                  <p className="font-bold text-sm">Calculation Recorded!</p>
                  <p className="mt-1">
                    {billSavedActivity.quantity} kWh × {billSavedActivity.factor_value}{" "}
                    {billSavedActivity.factor_unit} ={" "}
                    <strong>{billSavedActivity.emissions_kg.toFixed(2)} kg CO₂e</strong>
                  </p>
                  <Link
                    to={dashboardPath}
                    className="mt-2 inline-block font-semibold text-emerald-700 underline dark:text-ecogreen"
                  >
                    View on Dashboard →
                  </Link>
                </div>
              )}

              <button
                type="submit"
                disabled={savingBillActivity || !confirmedKwh}
                className="btn-primary w-full justify-center"
              >
                {savingBillActivity ? "Calculating & Saving…" : "Confirm & Save Activity"}
              </button>
            </form>
          </div>
        </section>
      ) : (
        /* Manual Activity Entry Workflow */
        <section className="surface-card p-6 sm:p-7 dark:border-white/10 dark:bg-[#0D1B2A]/85">
          <form onSubmit={submitManual} className="space-y-6">
            <div>
              <label className="form-label mb-2">Emissions Category</label>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {categories.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setCategory(item.value)}
                    className={`rounded-xl border p-3 text-center text-xs font-semibold transition-all ${
                      category === item.value
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-800 shadow-sm dark:border-ecogreen dark:bg-ecogreen/15 dark:text-ecogreen"
                        : "border-slate-200 bg-white/70 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.06]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="form-label">
                Activity Date *
                <input
                  className="form-input"
                  type="date"
                  required
                  value={activityDate}
                  onChange={(e) => setActivityDate(e.target.value)}
                />
              </label>

              <label className="form-label">
                Reporting Month
                <input
                  className="form-input bg-slate-100/60 text-slate-500 dark:bg-white/5 dark:text-slate-400"
                  type="text"
                  readOnly
                  value={period}
                />
              </label>
            </div>

            <label className="form-label">
              Activity Description *
              <input
                className="form-input"
                required
                maxLength={160}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Daily commute, Monthly electricity, Cooking gas"
              />
            </label>

            <div className="border-t border-slate-100 pt-5 dark:border-white/5">
              <h3 className="mb-4 text-sm font-semibold text-slate-800 dark:text-white">
                Measurement & Metrics
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="form-label">
                  Quantity *
                  <input
                    className="form-input"
                    type="number"
                    min="0.000001"
                    max="1000000000"
                    step="any"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="Enter positive amount"
                  />
                  {quantity !== "" && !validQuantity && (
                    <span className="mt-1 text-xs font-normal text-rose-600 dark:text-rose-400">
                      Enter a positive quantity.
                    </span>
                  )}
                </label>
                <label className="form-label">
                  Unit *
                  {units.length > 0 ? (
                    <select
                      className="form-input"
                      value={unit}
                      onChange={(e) => {
                        const nextUnit = e.target.value;
                        setUnit(nextUnit);
                        const matches = factors.filter((factor) => factorActivityUnit(factor) === nextUnit);
                        setFactorId(matches.length === 1 ? matches[0].id : "");
                      }}
                      required
                    >
                      <option value="">Select compatible unit</option>
                      {units.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      className="form-input bg-slate-100 dark:bg-white/5"
                      value=""
                      disabled
                      aria-label="Choose a unit"
                    >
                      <option value="">No factor units available</option>
                    </select>
                  )}
                </label>
              </div>
              <label className="form-label mt-4">
                Department or facility <span className="font-normal text-slate-400">(optional)</span>
                <input
                  className="form-input"
                  maxLength={120}
                  value={reportingUnit}
                  onChange={(e) => setReportingUnit(e.target.value)}
                  placeholder="e.g. Library, Fleet, Kitchen"
                />
              </label>
            </div>

            <div className="border-t border-slate-100 pt-5 dark:border-white/5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-white">
                  Documented Emission Factor
                </h3>
                {factors.length === 0 && !loadingFactors && (
                  <button
                    type="button"
                    onClick={handleSeedFactors}
                    className="text-xs font-semibold text-emerald-600 underline dark:text-ecogreen"
                  >
                    Seed standard factor set
                  </button>
                )}
              </div>
              {loadingFactors ? (
                <p className="text-sm text-slate-500">Loading verified factors…</p>
              ) : factors.length === 0 ? (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  No emission factors configured for {category}. Click "Initialize Reference Factors" above.
                </p>
              ) : (
                <label className="form-label">
                  Factor Definition
                  <select
                    className="form-input"
                    required
                    value={factorId}
                    disabled={!unit || compatibleFactors.length === 0}
                    onChange={(e) => setFactorId(e.target.value)}
                  >
                    <option value="">
                      {compatibleFactors.length ? "Select a factor" : "Select a compatible unit first"}
                    </option>
                    {compatibleFactors.map((factor) => (
                      <option key={factor.id} value={factor.id}>
                        {factor.name} — {factor.value} {factor.unit} ({factor.region})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {selectedFactor && (
                <div className="mt-3 rounded-xl bg-slate-100/70 p-3.5 text-xs leading-5 text-slate-600 dark:bg-white/[0.03] dark:text-slate-300">
                  <p className="font-bold text-slate-800 dark:text-white">{selectedFactor.name}</p>
                  <p>
                    Source: {selectedFactor.source_name} · Year: {selectedFactor.factor_year} · Region:{" "}
                    {selectedFactor.region}
                  </p>
                  <p>Unit: {selectedFactor.unit}</p>
                  {selectedFactor.source_url && (
                    <a
                      className="font-semibold text-emerald-600 underline dark:text-ecogreen"
                      href={selectedFactor.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View authoritative source
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 dark:border-ecogreen/20 dark:bg-ecogreen/5">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-ecogreen">
                Estimated Calculated Emissions
              </p>
              {previewValid && previewEmissions !== null ? (
                <>
                  <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">
                    {previewEmissions.toFixed(2)} kg CO₂e
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Source: {selectedFactor?.source_name} · Year: {selectedFactor?.factor_year}
                  </p>
                  <p className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    Formula: {numQuantity} {unit} × {selectedFactor?.value} {selectedFactor?.unit}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Select a verified factor and enter a quantity to preview calculated emissions.
                </p>
              )}
            </div>

            {saved && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-900 dark:border-ecogreen/30 dark:bg-ecogreen/15 dark:text-ecogreen">
                <p className="font-bold">Activity saved successfully into persistent ledger.</p>
                <p className="mt-1">
                  {saved.quantity} {saved.unit} × {saved.factor_value} {saved.factor_unit} ={" "}
                  <strong>{saved.emissions_kg.toFixed(2)} kg CO₂e</strong>
                </p>
                <Link
                  to={dashboardPath}
                  className="mt-2 inline-block font-semibold text-emerald-700 underline dark:text-ecogreen"
                >
                  View on Dashboard →
                </Link>
              </div>
            )}

            <button
              type="submit"
              className="btn-primary justify-center"
              disabled={!saveEnabled || saving}
            >
              {saving ? "Calculating & Saving…" : "Calculate and Save Activity"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
