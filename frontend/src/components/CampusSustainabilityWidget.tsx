import {
  GraduationCap,
  Building,
  UtensilsCrossed,
  Trophy,
  Calendar,
  Plus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../services/api";
import type {
  EventEmission,
  FoodWasteRecord,
  GreenChallenge,
  LeaderboardEntry,
} from "../types/api";

const CAMPUS_BUILDINGS = [
  { id: "academic", name: "Sir CV Raman Academic Complex", type: "Lecture Halls & Depts", kwh: 12400, waterL: 45000, color: "text-cyan-400" },
  { id: "hostel_a", name: "Aryabhatta Student Residence", type: "Boys Hostel Wing A", kwh: 8600, waterL: 110000, color: "text-violet-400" },
  { id: "hostel_b", name: "Kalpana Chawla Hall", type: "Girls Hostel Wing B", kwh: 7900, waterL: 98000, color: "text-hologram-magenta" },
  { id: "canteen", name: "Central Food Court & Mess", type: "Dining & Kitchen", kwh: 5200, waterL: 65000, color: "text-hologram-amber" },
  { id: "labs", name: "APJ Abdul Kalam Research Lab", type: "Advanced Computing & Chem", kwh: 14200, waterL: 32000, color: "text-hologram-blue" },
];

export function CampusSustainabilityWidget() {
  const [foodWasteList, setFoodWasteList] = useState<FoodWasteRecord[]>([]);
  const [challenges, setChallenges] = useState<GreenChallenge[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [events, setEvents] = useState<EventEmission[]>([]);

  // Food waste modal state
  const [showWasteModal, setShowWasteModal] = useState(false);
  const [canteenName, setCanteenName] = useState("Central Mess A");
  const [mealType, setMealType] = useState("Lunch");
  const [wasteKg, setWasteKg] = useState("");
  const [compostKg, setCompostKg] = useState("");

  // Event modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventName, setEventName] = useState("");
  const [eventAttendees, setEventAttendees] = useState("500");
  const [eventHours, setEventHours] = useState("6");
  const [eventGenKwh, setEventGenKwh] = useState("120");

  const [loading, setLoading] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    api.getFoodWaste(10).then(setFoodWasteList).catch(() => {});
    api.getChallenges().then(setChallenges).catch(() => {});
    api.getCampusLeaderboard().then(setLeaderboard).catch(() => {});
    api.getEvents().then(setEvents).catch(() => {});
  }, []);

  async function handleRecordFoodWaste(e: React.FormEvent) {
    e.preventDefault();
    if (!wasteKg || Number(wasteKg) <= 0) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await api.addFoodWaste({
        date: today,
        canteen_name: canteenName,
        meal_type: mealType,
        waste_kg: Number(wasteKg),
        diverted_compost_kg: Number(compostKg) || 0,
      });
      setShowWasteModal(false);
      setWasteKg("");
      setCompostKg("");
      setStatusNotice("Canteen food waste recorded & landfill methane avoided calculated!");
      const updated = await api.getFoodWaste(10);
      setFoodWasteList(updated);
    } catch {
      setStatusNotice("Failed to save food waste.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCalculateEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!eventName.trim()) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await api.calculateEvent({
        event_name: eventName.trim(),
        event_date: today,
        attendees: Number(eventAttendees) || 100,
        duration_hours: Number(eventHours) || 4,
        generator_kwh: Number(eventGenKwh) || 50,
        meals_served: Math.round(Number(eventAttendees) * 0.8),
        travel_km: Math.round(Number(eventAttendees) * 12),
      });
      setShowEventModal(false);
      setEventName("");
      setStatusNotice("Campus event emissions evaluated & recorded!");
      const updated = await api.getEvents();
      setEvents(updated);
    } catch {
      setStatusNotice("Failed to calculate event.");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinChallenge(chId: string) {
    setLoading(true);
    try {
      await api.joinChallenge(chId, {
        student_name: "GreenTrack Fellow",
        department_or_hostel: "Aryabhatta Hostel Block A",
      });
      setStatusNotice("Challenge joined! 50 participation impact points awarded.");
      const updatedCh = await api.getChallenges();
      setChallenges(updatedCh);
      const updatedLb = await api.getCampusLeaderboard();
      setLeaderboard(updatedLb);
    } catch {
      //
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {statusNotice && (
        <div className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3 text-xs font-semibold text-cyan-300">
          {statusNotice}
        </div>
      )}

      {/* Smart Campus Digital Twin Building Telemetry */}
      <section className="surface-card p-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-400 border border-cyan-400/30">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#F4F7FF]">
                Smart Campus Digital Twin — Real-Time Facility Telemetry
              </h2>
              <p className="text-xs text-[#A8B3CC]">
                Sub-metered electricity and municipal water consumption across campus buildings.
              </p>
            </div>
          </div>
          <span className="badge-cyan text-[10px]">Campus Grid Active</span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAMPUS_BUILDINGS.map((b) => (
            <div
              key={b.id}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-all hover:border-cyan-400/40 hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#F4F7FF]">{b.name}</h3>
                  <span className="text-[10px] text-[#A8B3CC]">{b.type}</span>
                </div>
                <Building className={`h-4 w-4 ${b.color}`} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[#080D1B] p-2.5 text-[11px]">
                <div>
                  <span className="text-[#A8B3CC] block">Electricity</span>
                  <strong className={b.color}>{b.kwh.toLocaleString()} kWh</strong>
                </div>
                <div>
                  <span className="text-[#A8B3CC] block">Water Draw</span>
                  <strong className="text-[#F4F7FF]">{(b.waterL / 1000).toFixed(1)} kL</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Row 2: Canteen Food Waste & Event Calculator */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Canteen Food Waste Section */}
        <section className="surface-card p-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-hologram-amber/10 text-hologram-amber">
                <UtensilsCrossed className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#F4F7FF]">Daily Canteen Food Waste</h3>
                <p className="text-xs text-[#A8B3CC]">Methane avoidance via on-site composting</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowWasteModal(true)}
              className="btn-secondary text-xs"
            >
              <Plus className="h-3.5 w-3.5" /> Log Waste
            </button>
          </div>

          {showWasteModal && (
            <form onSubmit={handleRecordFoodWaste} className="mt-4 rounded-xl border border-white/10 bg-[#080D1B] p-4 space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  placeholder="Canteen Name"
                  value={canteenName}
                  onChange={(e) => setCanteenName(e.target.value)}
                  className="form-input text-xs"
                />
                <select
                  value={mealType}
                  onChange={(e) => setMealType(e.target.value)}
                  className="form-input text-xs"
                >
                  <option value="Breakfast">Breakfast</option>
                  <option value="Lunch">Lunch</option>
                  <option value="Dinner">Dinner</option>
                </select>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  placeholder="Total Waste (kg)"
                  type="number"
                  step="0.1"
                  value={wasteKg}
                  onChange={(e) => setWasteKg(e.target.value)}
                  className="form-input text-xs"
                  required
                />
                <input
                  placeholder="Diverted to Compost (kg)"
                  type="number"
                  step="0.1"
                  value={compostKg}
                  onChange={(e) => setCompostKg(e.target.value)}
                  className="form-input text-xs"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowWasteModal(false)} className="btn-secondary text-xs">Cancel</button>
                <button type="submit" className="btn-primary text-xs" disabled={loading}>Submit Record</button>
              </div>
            </form>
          )}

          <div className="mt-4 divide-y divide-white/5">
            {foodWasteList.slice(0, 4).map((fw) => (
              <div key={fw.id} className="flex items-center justify-between py-2 text-xs">
                <div>
                  <span className="font-semibold text-[#F4F7FF]">{fw.canteen_name}</span> ·{" "}
                  <span className="text-[#A8B3CC]">{fw.meal_type} ({fw.waste_kg} kg waste)</span>
                </div>
                <strong className="text-hologram-amber">{fw.emissions_kg} kg CO₂e</strong>
              </div>
            ))}
          </div>
        </section>

        {/* Event Carbon Calculator */}
        <section className="surface-card p-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/10 text-violet-400">
                <Calendar className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#F4F7FF]">Event Carbon Calculator</h3>
                <p className="text-xs text-[#A8B3CC]">Assess college fests, seminars & conferences</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowEventModal(true)}
              className="btn-primary text-xs"
            >
              <Plus className="h-3.5 w-3.5" /> Evaluate Event
            </button>
          </div>

          {showEventModal && (
            <form onSubmit={handleCalculateEvent} className="mt-4 rounded-xl border border-white/10 bg-[#080D1B] p-4 space-y-3">
              <input
                placeholder="Event Title (e.g. Annual TechFest 2026)"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                className="form-input text-xs"
                required
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  placeholder="Attendees"
                  value={eventAttendees}
                  onChange={(e) => setEventAttendees(e.target.value)}
                  className="form-input text-xs"
                />
                <input
                  type="number"
                  placeholder="Duration (hrs)"
                  value={eventHours}
                  onChange={(e) => setEventHours(e.target.value)}
                  className="form-input text-xs"
                />
                <input
                  type="number"
                  placeholder="Gen (kWh)"
                  value={eventGenKwh}
                  onChange={(e) => setEventGenKwh(e.target.value)}
                  className="form-input text-xs"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowEventModal(false)} className="btn-secondary text-xs">Cancel</button>
                <button type="submit" className="btn-primary text-xs" disabled={loading}>Calculate Event Impact</button>
              </div>
            </form>
          )}

          <div className="mt-4 divide-y divide-white/5">
            {events.length > 0 ? (
              events.map((ev) => (
                <div key={ev.id} className="flex items-center justify-between py-2.5 text-xs">
                  <div>
                    <span className="font-semibold text-[#F4F7FF]">{ev.event_name}</span> ·{" "}
                    <span className="text-[#A8B3CC]">{ev.attendees} attendees</span>
                  </div>
                  <strong className="text-violet-400">{ev.total_emissions_kg} kg CO₂e</strong>
                </div>
              ))
            ) : (
              <p className="text-xs text-[#A8B3CC] py-4 text-center">
                No events evaluated yet. Click "Evaluate Event" to calculate festival or conference footprints.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Row 3: Student Green Challenges & Hostel Leaderboard */}
      <section className="surface-card p-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-hologram-blue/10 text-hologram-blue border border-hologram-blue/30">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#F4F7FF]">
                Student Sustainability Leaderboard & Verified Green Challenges
              </h2>
              <p className="text-xs text-[#A8B3CC]">
                Empower hostels, departments, and clubs through gamified verified climate action.
              </p>
            </div>
          </div>
          <span className="badge-blue text-[10px]">Verified Action Hub</span>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {/* Active Challenges */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Campus Green Challenges</h4>
            {challenges.slice(0, 3).map((ch) => (
              <div key={ch.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex items-center justify-between">
                <div>
                  <h5 className="font-bold text-sm text-[#F4F7FF]">{ch.title}</h5>
                  <p className="text-xs text-[#A8B3CC] mt-0.5">{ch.description}</p>
                  <span className="badge-cyan text-[9px] mt-2 inline-block">
                    Target: -{ch.target_reduction_pct}% {ch.category}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleJoinChallenge(ch.id)}
                  className="btn-secondary text-xs shrink-0"
                  disabled={loading}
                >
                  Join Challenge
                </button>
              </div>
            ))}
          </div>

          {/* Department / Hostel Leaderboard */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-violet-400 mb-3">Hostel & Dept Standings</h4>
            <div className="rounded-2xl border border-white/10 bg-[#080D1B] p-4 space-y-2.5">
              {leaderboard.length > 0 ? (
                leaderboard.map((lb, idx) => (
                  <div key={lb.department_or_hostel} className="flex items-center justify-between text-xs py-1.5 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className={`grid h-5 w-5 place-items-center rounded-full font-bold text-[10px] ${idx === 0 ? "bg-hologram-amber text-[#080D1B]" : "bg-white/10 text-[#F4F7FF]"}`}>
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-[#F4F7FF]">{lb.department_or_hostel}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[#A8B3CC]">{lb.verified_participants} participants</span>
                      <strong className="text-cyan-400 font-bold">{lb.total_points} pts</strong>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-xs text-[#A8B3CC] py-3">
                  Standings activate as students and faculty join active campus challenges.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
