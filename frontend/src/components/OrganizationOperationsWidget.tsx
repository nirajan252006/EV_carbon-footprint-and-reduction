import {
  Building2,
  Layers,
  Sparkles,
  FileSpreadsheet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { Facility, OperationsAdvisorItem, ScopeSummary } from "../types/api";

interface OrganizationOperationsWidgetProps {
  period: string;
  onRefresh?: () => void;
}

export function OrganizationOperationsWidget({
  period,
  onRefresh,
}: OrganizationOperationsWidgetProps) {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [advisorItems, setAdvisorItems] = useState<OperationsAdvisorItem[]>([]);
  const [scopes, setScopes] = useState<ScopeSummary[]>([]);
  const [showAddFacility, setShowAddFacility] = useState(false);
  const [newFacName, setNewFacName] = useState("");
  const [newFacType, setNewFacType] = useState("office");
  const [newFacArea, setNewFacArea] = useState("");
  const [loading, setLoading] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  useEffect(() => {
    api.getFacilities().then(setFacilities).catch(() => {});
    api.getOperationsAdvisor(period).then(setAdvisorItems).catch(() => {});
    api.getScopes(period).then(setScopes).catch(() => {});
  }, [period]);

  async function handleAddFacility(e: React.FormEvent) {
    e.preventDefault();
    if (!newFacName.trim()) return;
    setLoading(true);
    try {
      await api.addFacility({
        name: newFacName.trim(),
        site_type: newFacType,
        area_sqft: Number(newFacArea) || 0,
      });
      setNewFacName("");
      setNewFacArea("");
      setShowAddFacility(false);
      const updated = await api.getFacilities();
      setFacilities(updated);
    } catch (err) {
      //
    } finally {
      setLoading(false);
    }
  }

  async function handleSampleBulkImport() {
    setLoading(true);
    setImportStatus(null);
    try {
      const res = await api.bulkImport([
        {
          category: "electricity",
          description: "Mumbai Regional Headquarters Grid Ingestion",
          quantity: 4500.0,
          unit: "kWh",
          period,
          reporting_unit: "HQ Building",
        },
        {
          category: "fuel",
          description: "Factory Backup Generator Diesel Consumption",
          quantity: 320.0,
          unit: "L",
          period,
          reporting_unit: "Pune Factory Unit 1",
        },
        {
          category: "transport",
          description: "Fleet Distribution Transit Commute",
          quantity: 1200.0,
          unit: "km",
          period,
          reporting_unit: "Logistics Fleet",
        },
      ]);
      setImportStatus(`Bulk import successful: ${res.imported_count} utility records ingested.`);
      if (onRefresh) onRefresh();
    } catch (err) {
      setImportStatus("Bulk import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Scope 1, Scope 2, Scope 3 Classification Matrix */}
      <section className="surface-card p-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/30">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#F4F7FF]">
                GHG Protocol Scope 1, 2, 3 Emissions Classification
              </h2>
              <p className="text-xs text-[#A8B3CC]">
                Direct combustion, purchased energy, and supply chain value stream accounting.
              </p>
            </div>
          </div>
          <span className="badge-violet text-[10px]">ISO 14064 Compliant</span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {scopes.map((s, idx) => {
            const colors = [
              "border-cyan-400/30 text-cyan-400 bg-cyan-400/5",
              "border-violet-500/30 text-violet-400 bg-violet-500/5",
              "border-hologram-blue/30 text-hologram-blue bg-hologram-blue/5",
            ];
            return (
              <div
                key={s.scope}
                className={`rounded-2xl border p-4 ${colors[idx % colors.length]}`}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#A8B3CC]">
                  {s.scope}
                </span>
                <p className="mt-2 text-2xl font-black text-[#F4F7FF]">
                  {s.emissions_kg}{" "}
                  <span className="text-xs font-semibold text-[#A8B3CC]">kg CO₂e</span>
                </p>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-[#A8B3CC]">Total share</span>
                  <strong className="font-bold">{s.percentage}%</strong>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Multi-Site Operations Matrix */}
      <section className="surface-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-400 border border-cyan-400/30">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#F4F7FF]">
                Multi-Site & Operational Facilities
              </h2>
              <p className="text-xs text-[#A8B3CC]">
                Offices, manufacturing factories, distribution warehouses, and branches.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSampleBulkImport}
              disabled={loading}
              className="btn-secondary text-xs"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-cyan-400" />
              <span>Bulk Ingest Utilities</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddFacility(!showAddFacility)}
              className="btn-primary text-xs"
            >
              <span>+ Add Site / Plant</span>
            </button>
          </div>
        </div>

        {importStatus && (
          <div className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3 text-xs font-semibold text-cyan-300">
            {importStatus}
          </div>
        )}

        {showAddFacility && (
          <form onSubmit={handleAddFacility} className="mt-4 rounded-xl border border-white/10 bg-[#080D1B] p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Register New Facility</h4>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                placeholder="Site name (e.g. Pune Plant B)"
                value={newFacName}
                onChange={(e) => setNewFacName(e.target.value)}
                className="form-input text-xs"
                required
              />
              <select
                value={newFacType}
                onChange={(e) => setNewFacType(e.target.value)}
                className="form-input text-xs"
              >
                <option value="office">Regional Office</option>
                <option value="factory">Manufacturing Plant</option>
                <option value="warehouse">Logistics Warehouse</option>
                <option value="branch">Retail Branch</option>
              </select>
              <input
                type="number"
                placeholder="Floor area (sq ft)"
                value={newFacArea}
                onChange={(e) => setNewFacArea(e.target.value)}
                className="form-input text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddFacility(false)} className="btn-secondary text-xs">Cancel</button>
              <button type="submit" className="btn-primary text-xs" disabled={loading}>Save Facility</button>
            </div>
          </form>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {facilities.length > 0 ? (
            facilities.map((fac) => (
              <div
                key={fac.id}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-all hover:border-cyan-400/40"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-[#F4F7FF]">{fac.name}</span>
                  <span className="badge-cyan text-[10px] capitalize">{fac.site_type}</span>
                </div>
                <div className="mt-3 text-xs text-[#A8B3CC] space-y-1">
                  <p>Area: {fac.area_sqft ? `${fac.area_sqft} sq ft` : "Not specified"}</p>
                  <p>Telemetry Status: <strong className="text-cyan-400">Monitoring Active</strong></p>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-[#A8B3CC]">
              No individual facilities registered. Click "+ Add Site / Plant" to establish multi-building monitoring.
            </div>
          )}
        </div>
      </section>

      {/* AI Operations Advisor (Ranked by CO2e, Payback, Effort) */}
      <section className="surface-card p-6">
        <div className="flex items-center gap-3 border-b border-white/10 pb-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/30">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#F4F7FF]">
              AI Operations Advisor — Prioritized Enterprise Decarbonization
            </h2>
            <p className="text-xs text-[#A8B3CC]">
              Algorithms rank projects by total avoided emissions, implementation cost, payback speed, and operational feasibility.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {advisorItems.slice(0, 4).map((item, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-4 transition-all hover:border-violet-500/40 hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between">
                <span className="badge-violet text-[10px] uppercase font-bold">
                  {item.category}
                </span>
                <span className="text-xs font-bold text-cyan-400">
                  Feasibility: {Math.round(item.feasibility_score * 100)}%
                </span>
              </div>
              <h3 className="mt-2 text-sm font-bold text-[#F4F7FF]">{item.proposed_action}</h3>
              <p className="mt-1 text-xs text-[#A8B3CC]">{item.assumptions}</p>

              <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-[#080D1B] p-2.5 text-center text-[11px]">
                <div>
                  <span className="text-[#A8B3CC] block">Potential Avoided</span>
                  <strong className="text-cyan-400">{item.estimated_avoided_kg} kg</strong>
                </div>
                <div>
                  <span className="text-[#A8B3CC] block">Est. Capex</span>
                  <strong className="text-hologram-amber">₹{item.estimated_cost_inr.toLocaleString()}</strong>
                </div>
                <div>
                  <span className="text-[#A8B3CC] block">Payback</span>
                  <strong className="text-violet-400">{item.payback_months} mo</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
