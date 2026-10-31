import type {
  Activity,
  AccountType,
  AuthState,
  BillExtractionResult,
  CampusBus,
  ChatResponse,
  DashboardData,
  EventEmission,
  ExplainableIntelligence,
  Facility,
  Factor,
  FoodWasteRecord,
  GpsTrip,
  GreenChallenge,
  HealthStatus,
  IotLatestResponse,
  IotReading,
  IotSummaryResponse,
  LeaderboardEntry,
  OperationsAdvisorItem,
  RagDocument,
  Recommendation,
  ReductionGoal,
  ScopeSummary,
  Workspace,
} from "../types/api";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const CSRF_COOKIE = "greentrack_csrf";

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function csrfToken(): string | null {
  const entry = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${CSRF_COOKIE}=`));
  return entry ? decodeURIComponent(entry.slice(CSRF_COOKIE.length + 1)) : null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const csrf = csrfToken();
  if (csrf) headers.set("X-CSRF-Token", csrf);
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body: { detail?: string } = await response.json();
      message = body.detail ?? message;
    } catch {
      // Keep the HTTP status when the server response is not JSON.
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function jsonBody(value: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  };
}

export const api = {
  getMe: () => request<AuthState>("/api/auth/me"),
  register: (value: { full_name: string; email: string; password: string; account_type: AccountType; workspace_name?: string; location?: string }) =>
    request<AuthState>("/api/auth/register", jsonBody(value)),
  login: (value: { email: string; password: string }) =>
    request<AuthState>("/api/auth/login", jsonBody(value)),
  logout: () => request<void>("/api/auth/logout", jsonBody({})),
  saveWorkspace: (value: {
    name: string;
    account_type: AccountType;
    region: string;
    profile_name: string;
    profile_detail: string;
  }) =>
    request<Workspace>("/api/workspace", {
      ...jsonBody(value),
      method: "PUT",
    }),
  getHealth: () => request<HealthStatus>("/api/health"),
  getDashboard: (period: string) =>
    request<DashboardData>(`/api/dashboard?period=${encodeURIComponent(period)}`),
  getAnalytics: (metric: string, params: Record<string, string | number | null | undefined> = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") query.set(key, String(value));
    });
    return request<Record<string, any>>(`/api/analytics/${encodeURIComponent(metric)}${query.size ? `?${query}` : ""}`);
  },
  getActivities: (period: string) =>
    request<Activity[]>(`/api/activities?period=${encodeURIComponent(period)}`),
  addActivity: (value: {
    category: string;
    description: string;
    quantity: number;
    unit: string;
    period: string;
    activity_date?: string;
    reporting_unit: string;
    factor_id: string | null;
  }) => request<Activity>("/api/activities", jsonBody(value)),
  deleteActivity: (id: string) =>
    request<void>(`/api/activities/${encodeURIComponent(id)}`, { method: "DELETE" }),
  getFactors: (category?: string) =>
    request<Factor[]>(`/api/factors${category ? `?category=${encodeURIComponent(category)}` : ""}`),
  addFactor: (value: {
    category: string;
    name: string;
    value: number;
    unit: string;
    source_name: string;
    source_url: string;
    factor_year: number;
    region: string;
    assumptions: string;
  }) => request<Factor>("/api/factors", jsonBody(value)),
  seedFactors: () =>
    request<{ seeded_factors_count: number; message: string }>("/api/factors/seed", { method: "POST" }),
  setTarget: (monthly_target_kg: number | null) =>
    request<{ monthly_target_kg: number | null }>("/api/targets", {
      ...jsonBody({ monthly_target_kg }),
      method: "PUT",
    }),
  getRecommendations: (period: string) =>
    request<Recommendation[]>(`/api/recommendations?period=${encodeURIComponent(period)}`),
  getCarbonExplanation: (period: string) =>
    request<{ period: string; monthly_total_kg: number; daily: Array<{ activity_date: string; emissions_kg: number }>; categories: Array<{ category: string; emissions_kg: number }>; explanation: string; ai_generated: boolean }>(`/api/carbon-explanation?period=${encodeURIComponent(period)}`),
  getExplainableAi: (period: string) =>
    request<ExplainableIntelligence>(`/api/explainable-ai?period=${encodeURIComponent(period)}`),

  // Electricity Bill OCR & Analysis
  analyzeBill: (formData: FormData) =>
    request<BillExtractionResult>("/api/electricity/analyze-bill", { method: "POST", body: formData }),
  calculateElectricity: (value: {
    quantity: number;
    period: string;
    activity_date?: string;
    description?: string;
    reporting_unit?: string;
    factor_id?: string | null;
  }) => request<Activity>("/api/electricity/calculate", jsonBody(value)),

  // IoT Ingestion & Monitoring
  getIotLatest: (deviceId?: string) =>
    request<IotLatestResponse>(`/api/iot/latest${deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : ""}`),
  getIotHistory: (deviceId?: string, hours: number = 24, limit: number = 100) => {
    const query = new URLSearchParams({ hours: String(hours), limit: String(limit) });
    if (deviceId) query.set("device_id", deviceId);
    return request<{ device_id: string | null; sample_count: number; period_hours: number; energy_consumption_kwh: number; readings: IotReading[] }>(`/api/iot/history?${query}`);
  },
  getIotSummary: (deviceId?: string, period?: string) => {
    const query = new URLSearchParams();
    if (deviceId) query.set("device_id", deviceId);
    if (period) query.set("period", period);
    return request<IotSummaryResponse>(`/api/iot/summary${query.size ? `?${query}` : ""}`);
  },
  simulateIot: (deviceId: string = "esp32-energy-01", power_w?: number) =>
    request<{ status: string; reading: IotReading; device_health: any; note: string }>("/api/iot/simulate", jsonBody({ device_id: deviceId, power_w })),

  // Reduction Goals
  getGoals: () => request<ReductionGoal[]>("/api/goals"),
  createGoal: (value: {
    title: string;
    category?: string | null;
    baseline_period: string;
    baseline_emissions_kg: number;
    target_reduction_pct: number;
    target_period: string;
  }) => request<ReductionGoal>("/api/goals", jsonBody(value)),
  updateGoalStatus: (goalId: string, status: string) =>
    request<{ id: string; status: string }>(`/api/goals/${encodeURIComponent(goalId)}/status`, {
      ...jsonBody({ status }),
      method: "PATCH",
    }),

  // GPS Trips
  startTrip: (mode: string = "car", initialPoint?: { latitude: number; longitude: number; accuracy?: number }) =>
    request<GpsTrip>("/api/trips/start", jsonBody({ mode, initial_point: initialPoint })),
  addTripPoints: (tripId: string, points: Array<{ latitude: number; longitude: number; accuracy?: number; timestamp?: number }>) =>
    request<GpsTrip>(`/api/trips/${encodeURIComponent(tripId)}/points`, jsonBody({ points })),
  stopTrip: (tripId: string, factorValue?: number, factorName?: string) =>
    request<GpsTrip>(`/api/trips/${encodeURIComponent(tripId)}/stop`, jsonBody({ factor_value: factorValue, factor_name: factorName })),
  getTrips: (limit: number = 25) => request<GpsTrip[]>(`/api/trips?limit=${limit}`),

  // Multi-Site & Campus Facilities
  getFacilities: () => request<Facility[]>("/api/facilities"),
  addFacility: (value: { name: string; site_type: string; area_sqft?: number; baseline_kwh?: number; baseline_water_l?: number }) =>
    request<Facility>("/api/facilities", jsonBody(value)),

  // Smart Campus
  getFoodWaste: (limit: number = 30) => request<FoodWasteRecord[]>(`/api/college/food-waste?limit=${limit}`),
  addFoodWaste: (value: { date: string; canteen_name: string; meal_type: string; waste_kg: number; diverted_compost_kg?: number }) =>
    request<FoodWasteRecord>("/api/college/food-waste", jsonBody(value)),
  getCampusBuses: () => request<CampusBus[]>("/api/college/buses"),
  addCampusBus: (value: { route_name: string; bus_number: string; distance_km: number; avg_occupancy: number; fuel_type?: string }) =>
    request<CampusBus>("/api/college/buses", jsonBody(value)),
  getEvents: () => request<EventEmission[]>("/api/college/events"),
  calculateEvent: (value: { event_name: string; event_date: string; attendees: number; duration_hours: number; generator_kwh?: number; meals_served?: number; travel_km?: number }) =>
    request<EventEmission>("/api/college/events", jsonBody(value)),
  getChallenges: () => request<GreenChallenge[]>("/api/college/challenges"),
  addChallenge: (value: { title: string; description: string; category: string; target_reduction_pct: number; start_date: string; end_date: string }) =>
    request<GreenChallenge>("/api/college/challenges", jsonBody(value)),
  joinChallenge: (challengeId: string, value: { student_name: string; department_or_hostel: string }) =>
    request<{ id: string; student_name: string; points: number }>(`/api/college/challenges/${encodeURIComponent(challengeId)}/join`, jsonBody(value)),
  getCampusLeaderboard: () => request<LeaderboardEntry[]>("/api/college/leaderboard"),

  // Enterprise Organization
  getOperationsAdvisor: (period?: string) =>
    request<OperationsAdvisorItem[]>(`/api/organization/advisor${period ? `?period=${encodeURIComponent(period)}` : ""}`),
  getScopes: (period?: string) =>
    request<ScopeSummary[]>(`/api/organization/scopes${period ? `?period=${encodeURIComponent(period)}` : ""}`),
  bulkImport: (rows: Array<{ category: string; description: string; quantity: number; unit: string; period: string; reporting_unit?: string }>) =>
    request<{ imported_count: number; failed_count: number; errors: string[] }>("/api/organization/bulk-import", jsonBody({ rows })),

  // Knowledge Assistant RAG
  getDocuments: () => request<RagDocument[]>("/api/documents"),
  addSampleDocument: () => request<{ filename: string }>("/api/documents/sample", { method: "POST" }),
  uploadDocument: (form: FormData) =>
    request<{ filename: string }>("/api/documents", { method: "POST", body: form }),
  deleteDocument: (id: string) =>
    request<void>(`/api/documents/${encodeURIComponent(id)}`, { method: "DELETE" }),
  chat: (question: string) => request<ChatResponse>("/api/chat", jsonBody({ question })),
  report: async (period: string): Promise<Blob> => {
    const response = await fetch(
      `${API_BASE}/api/reports.csv?period=${encodeURIComponent(period)}`,
      { credentials: "same-origin" },
    );
    if (!response.ok) throw new Error(`Report request failed (${response.status}).`);
    return response.blob();
  },
  isUnauthorized: (error: unknown) =>
    error instanceof ApiError && error.status === 401,
};
