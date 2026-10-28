import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "../services/api";
import type { AccountType, AuthState, Workspace } from "../types/api";

interface WorkspaceContextValue {
  auth: AuthState | null;
  workspace: Workspace | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setWorkspace: (workspace: Workspace) => void;
  register: (value: {
    full_name: string;
    email: string;
    password: string;
    account_type: AccountType;
    workspace_name?: string;
    location?: string;
  }) => Promise<void>;
  login: (value: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setAuth(await api.getMe());
    } catch (reason) {
      if (api.isUnauthorized(reason)) {
        setAuth(null);
      } else {
        setError(reason instanceof Error ? reason.message : "Account could not be loaded.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const register = useCallback(async (value: {
    full_name: string;
    email: string;
    password: string;
    account_type: AccountType;
    workspace_name?: string;
    location?: string;
  }) => {
    setAuth(await api.register(value));
  }, []);

  const login = useCallback(async (value: { email: string; password: string }) => {
    setAuth(await api.login(value));
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setAuth(null);
  }, []);

  const setWorkspace = useCallback((workspace: Workspace) => {
    setAuth((current) =>
      current
        ? {
            ...current,
            workspace,
            onboarding_complete: workspace.onboarding_complete,
          }
        : current,
    );
  }, []);

  const value = useMemo(
    () => ({
      auth,
      workspace: auth?.workspace ?? null,
      loading,
      error,
      refresh,
      setWorkspace,
      register,
      login,
      logout,
    }),
    [auth, loading, error, refresh, setWorkspace, register, login, logout],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used within WorkspaceProvider.");
  return context;
}
