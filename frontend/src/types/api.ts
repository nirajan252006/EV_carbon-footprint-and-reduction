export type AccountType = "individual" | "college" | "organization";
export type Category = "electricity" | "transport" | "fuel" | "waste";

export interface Workspace {
  id: string;
  name: string;
  account_type: AccountType;
  region: string;
  monthly_target_kg: number | null;
  onboarding_complete: boolean;
  profile: {
    institution_name?: string;
    organization_name?: string;
    department?: string;
    sector?: string;
  } | null;
}

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  account_type: AccountType;
  role: "owner" | "admin" | "member";
}

export interface AuthState {
  user: AuthUser;
  workspace: Workspace;
  onboarding_complete: boolean;
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
  activity_date: string | null;
  reporting_unit: string;
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
}

export interface DashboardData {
  period: string;
  previous_period: string;
  total_kg: number;
  previous_total_kg: number;
  activity_count: number;
  categories: Array<{ category: Category; emissions_kg: number }>;
  daily: Array<{ activity_date: string; emissions_kg: number }>;
  contributors: Array<{
    id: string;
    category: Category;
    description: string;
    reporting_unit: string;
    emissions_kg: number;
  }>;
  trend: Array<{ period: string; emissions_kg: number }>;
  monthly_target_kg: number | null;
}

export interface Recommendation {
  category: Category;
  reason: string;
  action: string;
  estimated_savings_kg: number | null;
  savings_note: string;
}

export interface RagDocument {
  id: string;
  filename: string;
  source_url: string | null;
  created_at: string;
  chunk_count: number;
}

export interface RagSource {
  id: string;
  document_id: string;
  filename: string;
  page_number: number | null;
  source_url: string | null;
  similarity: number;
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

export interface IotSummaryResponse {
  period: string;
  total_consumption_kwh: number;
  estimated_emissions_kg: number;
  factor_applied: Factor | null;
  daily_breakdown: Array<{
    date: string;
    consumption_kwh: number;
    sample_count: number;
    average_power_w: number;
    peak_power_w: number;
  }>;
  sample_count: number;
  resets_detected: number;
}

export interface ActivityTrace {
  id: string;
  category: Category;
  description: string;
  activity_date: string;
  quantity: number;
  unit: string;
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
