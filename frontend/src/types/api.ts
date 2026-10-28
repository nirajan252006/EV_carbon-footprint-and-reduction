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
  ai_provider_configured: boolean;
  indexed_documents: number;
  workspace_configured: boolean;
}
