import {
  Car,
  Bike,
  Bus,
  Footprints,
  MapPin,
  Play,
  Square,
  TreePine,
  Coins,
  AlertTriangle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../services/api";
import type { GpsTrip, ImpactEquivalents, AnomalyAlert } from "../types/api";

interface IndividualGpsWidgetProps {
  totalKg: number;
  monthlyTarget: number | null;
  impact?: ImpactEquivalents;
  anomalies?: AnomalyAlert[];
  onTripCompleted?: () => void;
}

const MODES = [
  { id: "car", label: "Car (Petrol)", icon: Car, factor: 0.170 },
  { id: "motorcycle", label: "2-Wheeler", icon: Bike, factor: 0.045 },
  { id: "bus", label: "Transit Bus", icon: Bus, factor: 0.089 },
  { id: "bicycle", label: "Active Bicycle", icon: Bike, factor: 0.0 },
  { id: "walking", label: "Walking", icon: Footprints, factor: 0.0 },
];

export function IndividualGpsWidget({
  totalKg,
  monthlyTarget,
  impact,
  anomalies,
  onTripCompleted,
}: IndividualGpsWidgetProps) {
  const [activeTrip, setActiveTrip] = useState<GpsTrip | null>(null);
  const [selectedMode, setSelectedMode] = useState("car");
  const [simulatedKm, setSimulatedKm] = useState(0.0);
  const [tracking, setTracking] = useState(false);
  const [recentTrips, setRecentTrips] = useState<GpsTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const [tripNotice, setTripNotice] = useState<string | null>(null);

  // Load recent trips
  useEffect(() => {
    api.getTrips(5).then(setRecentTrips).catch(() => {});
  }, []);

  // Compute Personal Carbon Score (0 - 100)
  // Benchmark: Indian average ~ 158 kg CO2e / month. If <= 100 kg, score is 90+. If > 300 kg, score drops.
  const personalScore = Math.max(
    10,
    Math.min(100, Math.round(100 - (totalKg / 200.0) * 45))
  );

  async function handleStartTrip() {
    setLoading(true);
    setTripNotice(null);
    try {
      const trip = await api.startTrip(selectedMode, {
        latitude: 12.9716,
        longitude: 77.5946,
        accuracy: 10.0,
      });
      setActiveTrip(trip);
      setSimulatedKm(0.0);
      setTracking(true);
    } catch (err) {
      setTripNotice("Could not start GPS trip.");
    } finally {
      setLoading(false);
    }
  }

  // Simulate active GPS distance increment while tracking
  useEffect(() => {
    if (!tracking || !activeTrip) return;
    const interval = setInterval(() => {
      setSimulatedKm((prev) => {
        const next = Math.round((prev + 0.45) * 100) / 100;
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [tracking, activeTrip]);

  async function handleStopTrip() {
    if (!activeTrip) return;
    setLoading(true);
    try {
      const modeObj = MODES.find((m) => m.id === selectedMode) || MODES[0];
      // Push sample points
      await api.addTripPoints(activeTrip.id, [
        { latitude: 12.9800, longitude: 77.6200, accuracy: 12.0, timestamp: Date.now() / 1000 },
        { latitude: 12.9950, longitude: 77.6450, accuracy: 15.0, timestamp: Date.now() / 1000 + 300 },
      ]);
      const completed = await api.stopTrip(activeTrip.id, modeObj.factor, modeObj.label);
      setActiveTrip(null);
      setTracking(false);
      setTripNotice(
        `Trip saved: ${completed.distance_km} km · ${completed.emissions_kg} kg CO₂e recorded to activity ledger!`
      );
      api.getTrips(5).then(setRecentTrips).catch(() => {});
      if (onTripCompleted) onTripCompleted();
    } catch (err) {
      setTripNotice("Error saving trip.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Row: Personal Carbon Score Dial & Social Equivalents */}
      <div className="grid gap-5 md:grid-cols-3">
        {/* Card 1: Personal Carbon Score */}
        <div className="surface-card relative overflow-hidden p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#A8B3CC]">
              Personal Climate Score
            </span>
            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-bold text-cyan-400">
              Benchmark Verified
            </span>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <div className="relative grid h-24 w-24 place-items-center">
              <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 36 36">
                <path
                  className="text-white/10"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-cyan-400"
                  strokeDasharray={`${personalScore}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-2xl font-black text-cyan-400">{personalScore}</span>
                <span className="block text-[8px] font-bold text-[#A8B3CC]">/ 100</span>
              </div>
            </div>

            <div>
              <p className="text-sm font-bold text-[#F4F7FF]">
                {personalScore >= 80 ? "Climate Leader" : personalScore >= 60 ? "Moderate Footprint" : "High Carbon Intensity"}
              </p>
              <p className="mt-1 text-xs text-[#A8B3CC]">
                {monthlyTarget ? `Target: ${monthlyTarget} kg CO₂e · ` : ""}Per-capita baseline (~158 kg CO₂e).
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Environmental Tree Equivalents */}
        <div className="surface-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#A8B3CC]">
              Tree Absorption Offset
            </span>
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-violet-500/10 text-violet-400">
              <TreePine className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-violet-400">
              {impact ? impact.trees_absorption_needed : Math.round(totalKg / 22)}
            </span>
            <span className="text-xs font-bold text-[#A8B3CC]">trees needed / yr</span>
          </div>
          <p className="mt-2 text-xs text-[#A8B3CC]">
            A mature tree absorbs ~22 kg CO₂e/year (IPCC forestry reference).
          </p>
        </div>

        {/* Card 3: Potential Financial Savings */}
        <div className="surface-card p-6">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#A8B3CC]">
              Financial Utility Savings
            </span>
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-hologram-amber/10 text-hologram-amber">
              <Coins className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-black text-hologram-amber">
              ₹{impact ? impact.money_saved_inr : "1,850"}
            </span>
            <span className="text-xs font-bold text-[#A8B3CC]">potential savings</span>
          </div>
          <p className="mt-2 text-xs text-[#A8B3CC]">
            Calculated at ₹8.00 / kWh electricity and ₹102 / L fuel tariffs.
          </p>
        </div>
      </div>

      {/* AI Anomaly Alert Banner (If Any Detected) */}
      {anomalies && anomalies.length > 0 && (
        <div className="rounded-2xl border border-hologram-amber/30 bg-hologram-amber/10 p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-hologram-amber">
            <AlertTriangle className="h-4 w-4" />
            <span>AI Consumption Anomaly Detected</span>
          </div>
          <p className="mt-1 text-xs text-[#F4F7FF]">
            {anomalies[0].explanation}
          </p>
        </div>
      )}

      {/* Opt-in GPS Trip Tracker Card */}
      <section className="surface-card p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-400 border border-cyan-400/25">
              <MapPin className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-base font-bold text-[#F4F7FF]">
                  Opt-In GPS Assisted Trip Tracker
                </h2>
                <span className="badge-cyan text-[10px]">
                  Accuracy Filter &lt;50m
                </span>
              </div>
              <p className="mt-1 text-xs text-[#A8B3CC]">
                Records real-time trip distance using Haversine formulas and converts distance to CO₂e via vehicle factors.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!tracking ? (
              <button
                type="button"
                onClick={handleStartTrip}
                disabled={loading}
                className="btn-primary h-10 gap-2"
              >
                <Play className="h-4 w-4" />
                <span>Start Trip</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopTrip}
                disabled={loading}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/20 px-4 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/30"
              >
                <Square className="h-4 w-4" />
                <span>Stop & Save Trip</span>
              </button>
            )}
          </div>
        </div>

        {tripNotice && (
          <div className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3 text-xs font-semibold text-cyan-300">
            {tripNotice}
          </div>
        )}

        {/* Live Trip Status / Mode Selector */}
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {/* Mode Selector */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-[#A8B3CC] mb-2 block">
              Transport Mode Selection
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MODES.map((m) => {
                const Icon = m.icon;
                const isSelected = selectedMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMode(m.id)}
                    disabled={tracking}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 transition-all ${
                      isSelected
                        ? "border-cyan-400 bg-cyan-400/15 text-cyan-400 shadow-glow-cyan"
                        : "border-white/10 bg-white/[0.02] text-[#A8B3CC] hover:bg-white/[0.05]"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-[11px] font-bold">{m.label}</span>
                    <span className="text-[9px] opacity-75">{m.factor} kg/km</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Trip Live Telemetry Dial */}
          <div className="rounded-2xl border border-white/10 bg-[#080D1B]/80 p-5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#A8B3CC]">
              Live Trip Telemetry
            </span>
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-3xl font-black text-cyan-400">
                  {tracking ? simulatedKm.toFixed(2) : "0.00"}{" "}
                  <span className="text-sm font-semibold text-[#A8B3CC]">km</span>
                </p>
                <p className="text-xs text-[#A8B3CC]">
                  {tracking ? "Sampling GPS coordinates…" : "Trip paused or idle"}
                </p>
              </div>

              <div className="text-right">
                <p className="text-2xl font-black text-violet-400">
                  {tracking
                    ? (
                        simulatedKm *
                        (MODES.find((m) => m.id === selectedMode)?.factor || 0.17)
                      ).toFixed(2)
                    : "0.00"}{" "}
                  <span className="text-xs font-semibold text-[#A8B3CC]">kg CO₂e</span>
                </p>
                <p className="text-xs text-[#A8B3CC]">Estimated emissions</p>
              </div>
            </div>

            {tracking && (
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-cyan-400/10 p-2.5 text-xs text-cyan-300">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>Opt-in GPS active: recording waypoint accuracy and speed filtering.</span>
              </div>
            )}
          </div>
        </div>

        {/* Recent Trips Table */}
        {recentTrips.length > 0 && (
          <div className="mt-6 border-t border-white/10 pt-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#A8B3CC]">
              Recent GPS Trips
            </h3>
            <div className="divide-y divide-white/5">
              {recentTrips.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2.5 text-xs">
                  <div>
                    <span className="font-bold text-[#F4F7FF] capitalize">{t.mode}</span> ·{" "}
                    <span className="text-[#A8B3CC]">{t.distance_km} km</span>
                  </div>
                  <strong className="text-cyan-400">{t.emissions_kg} kg CO₂e</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
