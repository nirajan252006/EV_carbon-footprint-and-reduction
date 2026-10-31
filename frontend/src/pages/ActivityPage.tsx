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
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

  async function handleSeedFactors() {
    setSeeding(true);
    setSeedNotice(null);
    setError(null);
    try {
      const res = await api.seedFactors();
      setSeedNotice(res.message);
      const updated = await api.getFactors(category);
      setFactors(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not seed reference factors.");
    } finally {
      setSeeding(false);
    }
  }

  async function submitManual(event: FormEvent<HTMLFormElement>) {
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
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="MEASUREMENT & INGESTION"
        title="Record carbon"
        highlight="emissions."
        description="Log carbon emissions across Electricity, Transport, Fuel, and Waste with verified emission factor tracing, or extract electricity bills automatically."
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSeedFactors}
              disabled={seeding}
              className="btn-secondary text-xs"
              title="Initialize standard CEA Grid, EPA Fuel, DEFRA Transport, and WARM Waste factors"
            >
              <Sparkles className="h-3.5 w-3.5 text-leaf" />
              {seeding ? "Initializing…" : "Initialize Reference Factors"}
            </button>
            <Link to={dashboardPath} className="btn-secondary text-xs">
              View Dashboard
            </Link>
          </div>
        }
      />

      {seedNotice && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-medium text-emerald-900">
          <span>{seedNotice}</span>
          <button onClick={() => setSeedNotice(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && <div className="mb-4"><ErrorState message={error} /></div>}

      {/* Mode Tabs */}
      <div className="mb-6 flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab("manual")}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition ${
            activeTab === "manual"
              ? "border-[#315C85] text-[#315C85]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <Calculator className="h-4 w-4" /> Manual Activity Entry
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("bill_ocr")}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-semibold transition ${
            activeTab === "bill_ocr"
              ? "border-[#315C85] text-[#315C85]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <FileUp className="h-4 w-4" /> Electricity Bill OCR Upload
        </button>
      </div>

      {activeTab === "bill_ocr" ? (
        /* Bill OCR Upload Workflow */
        <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="surface-card p-6">
            <div className="mb-4">
              <h2 className="text-base font-bold text-slate-900">Electricity Bill Scanner & Parser</h2>
              <p className="mt-1 text-xs text-slate-500">
                Upload your utility electricity bill (PDF, JPG, PNG, TIFF, BMP up to 10 MB). The system detects billed units (kWh),
                billing period, and isolates meter readings from tariffs.
              </p>
            </div>

            {billError && <div className="mb-4"><ErrorState message={billError} /></div>}

            {/* Drag & Drop Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files?.[0]) onBillFileSelected(e.dataTransfer.files[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
                dragOver
                  ? "border-[#315C85] bg-[#EAF0F6]"
                  : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100/60"
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
              <div className="mb-2 grid h-12 w-12 place-items-center rounded-xl bg-white shadow-sm">
                {analyzingBill ? (
                  <RefreshCw className="h-6 w-6 animate-spin text-[#315C85]" />
                ) : (
                  <Upload className="h-6 w-6 text-[#315C85]" />
                )}
              </div>
              <p className="text-sm font-semibold text-slate-800">
                {analyzingBill
                  ? "Analyzing document & recognizing text…"
                  : billFile
                  ? billFile.name
                  : "Click to select or drag and drop your electricity bill"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Supports selectable digital PDFs, scanned bills, and images (up to 10 MB)
              </p>
            </div>

            {/* Extraction Results */}
            {billResult && (
              <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <span className="text-sm font-bold text-slate-800">Extraction Results</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-700">
                      Engine: {billResult.engine_used.replace(/_/g, " ")}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-bold ${
                        billResult.confidence >= 0.85
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {Math.round(billResult.confidence * 100)}% Confidence
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Extracted Billed Consumption</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {billResult.extracted_consumption !== null
                        ? `${billResult.extracted_consumption} kWh`
                        : "Ambiguous / Not Detected"}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Detected Billing Period</p>
                    <p className="mt-1 text-lg font-bold text-slate-900">
                      {billResult.billing_period || "Current Month"}
                    </p>
                  </div>
                </div>

                {billResult.evidence && billResult.evidence.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-slate-600">Evidence from Document Text:</p>
                    <ul className="mt-1 space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-700 font-mono">
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
          <div className="surface-card p-6">
            <h3 className="text-sm font-bold text-slate-900">Verify & Save Emissions</h3>
            <p className="mt-1 text-xs text-slate-500">
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
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900">
                  <p className="font-bold text-sm">Calculation Recorded!</p>
                  <p className="mt-1">
                    {billSavedActivity.quantity} kWh × {billSavedActivity.factor_value} {billSavedActivity.factor_unit} ={" "}
                    <strong>{billSavedActivity.emissions_kg.toFixed(2)} kg CO₂e</strong>
                  </p>
                  <Link to={dashboardPath} className="mt-2 inline-block font-semibold text-blue-700 underline">
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
        <section className="surface-card p-6">
          <form onSubmit={submitManual} className="space-y-6">
            <div>
              <label className="form-label">Emissions Category</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {categories.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setCategory(item.value)}
                    className={`rounded-xl border p-3 text-center text-xs font-semibold transition ${
                      category === item.value
                        ? "border-[#315C85] bg-[#EAF0F6] text-[#315C85]"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
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
                <input className="form-input bg-slate-50 text-slate-500" type="text" readOnly value={period} />
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

            <div className="border-t border-slate-100 pt-5">
              <h3 className="mb-4 text-sm font-semibold text-slate-800">Measurement</h3>
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
                    <span className="mt-1 text-xs font-normal text-red-600">Enter a positive quantity.</span>
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
                    <select className="form-input bg-slate-50" value="" disabled aria-label="Choose a unit">
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

            <div className="border-t border-slate-100 pt-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">Emission Factor</h3>
                {factors.length === 0 && !loadingFactors && (
                  <button
                    type="button"
                    onClick={handleSeedFactors}
                    className="text-xs font-semibold text-blue-700 underline"
                  >
                    Seed standard factor set
                  </button>
                )}
              </div>
              {loadingFactors ? (
                <p className="text-sm text-slate-500">Loading verified factors…</p>
              ) : factors.length === 0 ? (
                <p className="text-sm text-amber-700">
                  No emission factors configured for {category}. Click "Initialize Reference Factors" above.
                </p>
              ) : (
                <label className="form-label">
                  Documented Emission Factor
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
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600">
                  <p className="font-semibold text-slate-700">{selectedFactor.name}</p>
                  <p>
                    Source: {selectedFactor.source_name} · Year: {selectedFactor.factor_year} · Region:{" "}
                    {selectedFactor.region}
                  </p>
                  <p>Unit: {selectedFactor.unit}</p>
                  {selectedFactor.source_url && (
                    <a
                      className="font-medium text-blue-700 underline"
                      href={selectedFactor.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View factor source
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Estimated Emissions</p>
              {previewValid && previewEmissions !== null ? (
                <>
                  <p className="mt-1 text-lg font-bold text-slate-900">{previewEmissions.toFixed(2)} kg CO₂e</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Source: {selectedFactor?.source_name} · Year: {selectedFactor?.factor_year}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">Deterministic result: {numQuantity} {unit} × {selectedFactor?.value} {selectedFactor?.unit}</p>
                </>
              ) : (
                <p className="mt-1 text-sm text-slate-600">Select a verified factor and enter a quantity to preview.</p>
              )}
            </div>

            {saved && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="font-semibold">Activity saved successfully.</p>
                <p className="mt-1">
                  {saved.quantity} {saved.unit} × {saved.factor_value} {saved.factor_unit} ={" "}
                  <strong>{saved.emissions_kg.toFixed(2)} kg CO₂e</strong>
                </p>
                <Link to={dashboardPath} className="mt-2 inline-block font-semibold text-blue-700 underline">
                  View dashboard
                </Link>
              </div>
            )}

            <button type="submit" className="btn-primary justify-center" disabled={!saveEnabled || saving}>
              {saving ? "Saving activity…" : "Calculate and save activity"} <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
