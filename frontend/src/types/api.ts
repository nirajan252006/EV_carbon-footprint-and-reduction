export type AccountType = "individual" | "college" | "organization";

export type Category = "electricity" | "transport" | "fuel" | "waste" | "water";

export interface User {
  id: string;
  email: string;
  full_name: string;
  account_type: AccountType;
  role: "owner" | "admin" | "member";
  created_at: string;
}

export interface WorkspaceProfile {
  institution_name?: string;
  department?: string;
  organization_name?: string;
  sector?: string;
}

export interface Workspace {
  id: string;
  name: string;
  account_type: AccountType;
  region: string;
  monthly_target_kg: number | null;
  onboarding_complete: boolean;
  profile?: WorkspaceProfile;
  created_at: string;
}

export interface AuthState {
  user: User;
  workspace: Workspace | null;
  workspaces?: Workspace[];
  onboarding_complete?: boolean;
}

export interface Factor {
  id: string;
  category: Category;
  name: string;
  value: number;
  unit: string;
  source_name: string;
  source_url: string;
  factor_year: number;
  region: string;
  assumptions: string;
}

export interface Activity {
  id: string;
  category: Category;
  description: string;
  quantity: number;
  unit: string;
  period: string;
  activity_date?: string;
  reporting_unit?: string;
  factor_id: string;
  factor_name: string;
  factor_value: number;
  factor_unit: string;
  factor_source: string;
  factor_source_url: string;
  factor_year: number;
  factor_region: string;
  assumptions: string;
  emissions_kg: number;
  data_origin?: string;
  scope?: "scope_1" | "scope_2" | "scope_3";
  created_at: string;
}

export interface CategoryBreakdown {
  category: Category;
  emissions_kg: number;
  activity_count: number;
}

export interface DailyPoint {
  activity_date: string;
  emissions_kg: number;
}

export interface TrendPoint {
  period: string;
  emissions_kg: number;
}

export interface DashboardData {
  period: string;
  total_kg: number;
  activity_count: number;
  monthly_target_kg: number | null;
  previous_period: string;
  previous_total_kg: number;
  categories: CategoryBreakdown[];
  daily: DailyPoint[];
  trend: TrendPoint[];
}

export interface RagSource {
  id?: string;
  document_id?: string;
  document_name: string;
  filename?: string;
  source_url?: string;
  page_number: number | null;
  snippet: string;
}

export interface RagDocument {
  id: string;
  filename: string;
  source_url?: string;
  chunk_count: number;
  created_at: string;
}

export interface IotSummaryResponse {
  period: string;
  total_consumption_kwh: number;
  estimated_emissions_kg: number;
  factor_applied: Factor | null;
  daily_breakdown: Array<{ date: string; consumption_kwh: number; sample_count: number }>;
  sample_count: number;
  resets_detected: number;
}

export interface ChatResponse {
  answer: string;
  sources: RagSource[];
  insufficient_evidence: boolean;
}

export interface HealthStatus {
  status: string;
  database?: string;
  ai_provider_configured: boolean;
  ocr_available?: boolean;
  ocr_engine?: string;
  tesseract_installed?: boolean;
  iot_configured?: boolean;
  iot_active_devices?: number;
  indexed_documents: number;
  workspace_configured: boolean;
}

export interface BillExtractionResult {
  status: "success" | "partial" | "ocr_unavailable" | "empty_text" | "error";
  message: string;
  extracted_consumption: number | null;
  unit: string;
  billing_period: string;
  confidence: number;
  evidence: string[];
  engine_used: string;
  requires_confirmation: boolean;
  tesseract_installed?: boolean;
  raw_text_snippet?: string;
}

export interface IotReading {
  id: string;
  device_id: string;
  workspace_id: string;
  voltage: number;
  current: number;
  power: number;
  energy_kwh: number;
  temperature: number | null;
  humidity: number | null;
  is_simulated: number;
  recorded_at: string;
  device_name?: string;
  location?: string;
}

export interface IotDeviceHealth {
  status: "online" | "stale" | "offline";
  reading_age_seconds: number | null;
  reading_age_human: string;
  is_fresh: boolean;
}

export interface IotLatestResponse {
  latest_reading: IotReading | null;
  device_health: IotDeviceHealth;
  devices: Array<{
    device_id: string;
    device_name: string;
    location: string;
    last_seen_at: string | null;
  }>;
}

export interface ActivityTrace {
  id: string;
  category: Category;
  description: string;
  activity_date: string;
  quantity: number;
  unit: string;
  scope?: string;
  factor_name: string;
  factor_value: number;
  factor_unit: string;
  factor_source: string;
  factor_source_url: string;
  factor_year: number;
  emissions_kg: number;
  formula: string;
  explanation: string;
  data_origin: string;
  is_measured: boolean;
}

export interface ScopeSummary {
  scope: string;
  emissions_kg: number;
  percentage: number;
}

export interface AnomalyAlert {
  date: string;
  emissions_kg: number;
  expected_avg_kg: number;
  spike_percentage: number;
  severity: "high" | "medium";
  explanation: string;
}

export interface ForecastingResult {
  projected_kg: number;
  confidence: number;
  methodology: string;
  trend_direction: "increasing" | "decreasing" | "stable";
}

export interface ImpactEquivalents {
  emissions_kg: number;
  avoided_kg: number;
  trees_absorption_needed: number;
  trees_preserved: number;
  money_saved_inr: number;
  water_litres_saved: number;
}

export interface OperationsAdvisorItem {
  category: Category;
  current_emissions_kg: number;
  proposed_action: string;
  scenario_reduction_pct: number;
  estimated_avoided_kg: number;
  estimated_cost_inr: number;
  payback_months: number;
  effort: "Low" | "Moderate" | "High";
  feasibility_score: number;
  formula: string;
  assumptions: string;
  priority: string;
  disclaimer: string;
}

export interface ExplainableIntelligence {
  period: string;
  workspace_name: string;
  account_type: AccountType;
  total_emissions_kg: number;
  activity_count: number;
  what_happened: string;
  largest_contributor: {
    category: Category;
    emissions_kg: number;
    percentage_of_total: number;
    summary: string;
  } | null;
  category_rankings: Array<{
    category: Category;
    emissions_kg: number;
    percentage_of_total: number;
  }>;
  scopes_breakdown?: ScopeSummary[];
  period_comparison: {
    current_period: string;
    current_total_kg: number;
    previous_period: string;
    previous_total_kg: number;
    change_kg: number | null;
    change_pct: number | null;
    has_prior_baseline: boolean;
    note: string;
  };
  activity_traces: ActivityTrace[];
  recommendations: Array<{
    category: Category;
    current_emissions_kg: number;
    proposed_action: string;
    scenario_reduction_pct: number;
    estimated_avoided_kg: number;
    formula: string;
    assumptions: string;
    difficulty: string;
    priority: string;
    disclaimer: string;
  }>;
  operations_advisor?: OperationsAdvisorItem[];
  anomalies?: AnomalyAlert[];
  forecast?: ForecastingResult;
  impact_equivalents?: ImpactEquivalents;
  uncertainty_and_assumptions: string[];
  ai_generated: boolean;
  daily_distribution: Array<{ activity_date: string; emissions_kg: number }>;
  generated_at: string;
}

export interface ReductionGoal {
  id: string;
  workspace_id: string;
  title: string;
  category: string | null;
  baseline_period: string;
  baseline_emissions_kg: number;
  target_reduction_pct: number;
  target_emissions_kg: number;
  target_period: string;
  status: "active" | "achieved" | "missed" | "cancelled";
  created_at: string;
}

export interface Recommendation {
  category: Category;
  action: string;
  reason: string;
  estimated_savings_kg: number | null;
  savings_note: string;
}

export interface GpsTrip {
  id: string;
  workspace_id: string;
  user_id?: string;
  mode: string;
  start_time: string;
  end_time?: string;
  distance_km: number;
  emissions_kg: number;
  status: "in_progress" | "completed";
  points?: Array<{ latitude: number; longitude: number; accuracy?: number; timestamp?: number }>;
  created_at: string;
}

export interface Facility {
  id: string;
  workspace_id: string;
  name: string;
  site_type: string;
  area_sqft: number;
  baseline_kwh: number;
  baseline_water_l: number;
  created_at: string;
}

export interface FoodWasteRecord {
  id: string;
  workspace_id: string;
  date: string;
  canteen_name: string;
  meal_type: string;
  waste_kg: number;
  emissions_kg: number;
  diverted_compost_kg: number;
  created_at: string;
}

export interface CampusBus {
  id: string;
  workspace_id: string;
  route_name: string;
  bus_number: string;
  distance_km: number;
  avg_occupancy: number;
  fuel_type: string;
  daily_emissions_kg: number;
  created_at: string;
}

export interface EventEmission {
  id: string;
  workspace_id: string;
  event_name: string;
  event_date: string;
  attendees: number;
  duration_hours: number;
  breakdown: Record<string, number>;
  total_emissions_kg: number;
  created_at: string;
}

export interface GreenChallenge {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  category: string;
  target_reduction_pct: number;
  start_date: string;
  end_date: string;
  participants_count: number;
  verified_co2e_saved_kg: number;
  status: string;
  created_at: string;
}

export interface LeaderboardEntry {
  department_or_hostel: string;
  verified_participants: number;
  total_points: number;
}
