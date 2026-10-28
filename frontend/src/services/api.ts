import type {
  Activity,
  AccountType,
  ChatResponse,
  DashboardData,
  Factor,
  HealthStatus,
  RagDocument,
  Recommendation,
  Workspace,
} from "../types/api";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body: { detail?: string } = await response.json();
      message = body.detail ?? message;
    } catch {
      // Keep the HTTP status when the server response is not JSON.
    }
    throw new Error(message);
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
  getWorkspace: () => request<Workspace | null>("/api/workspace"),
  saveWorkspace: (value: { name: string; account_type: AccountType; region: string }) =>
    request<Workspace>("/api/workspace", {
      ...jsonBody(value),
      method: "PUT",
    }),
  getHealth: () => request<HealthStatus>("/api/health"),
  getDashboard: (period: string) =>
    request<DashboardData>(`/api/dashboard?period=${encodeURIComponent(period)}`),
  getActivities: (period: string) =>
    request<Activity[]>(`/api/activities?period=${encodeURIComponent(period)}`),
  addActivity: (value: {
    category: string;
    description: string;
    quantity: number;
    unit: string;
    period: string;
    reporting_unit: string;
    factor_id: string;
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
  setTarget: (monthly_target_kg: number | null) =>
    request<{ monthly_target_kg: number | null }>("/api/targets", {
      ...jsonBody({ monthly_target_kg }),
      method: "PUT",
    }),
  getRecommendations: (period: string) =>
    request<Recommendation[]>(`/api/recommendations?period=${encodeURIComponent(period)}`),
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
    );
    if (!response.ok) throw new Error(`Report request failed (${response.status}).`);
    return response.blob();
  },
};
