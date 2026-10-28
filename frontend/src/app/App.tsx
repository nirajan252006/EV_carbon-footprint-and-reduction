import { lazy, Suspense } from "react";
import { MotionConfig } from "framer-motion";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/Feedback";
import { useWorkspace, WorkspaceProvider } from "../hooks/WorkspaceContext";
import { AppLayout } from "../layouts/AppLayout";
import { AccountSelectionPage } from "../pages/AccountSelectionPage";
import { AuthPage } from "../pages/AuthPage";
import { OnboardingPage } from "../pages/OnboardingPage";
import type { AccountType } from "../types/api";

const DashboardPage = lazy(() => import("../pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const ActivityPage = lazy(() => import("../pages/ActivityPage").then((module) => ({ default: module.ActivityPage })));
const FactorsPage = lazy(() => import("../pages/FactorsPage").then((module) => ({ default: module.FactorsPage })));
const AssistantPage = lazy(() => import("../pages/AssistantPage").then((module) => ({ default: module.AssistantPage })));

const accountTypes: AccountType[] = ["individual", "college", "organization"];

function isAccountType(value: string | undefined): value is AccountType {
  return accountTypes.some((type) => type === value);
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <WorkspaceProvider>
          <Suspense fallback={<LoadingState />}>
            <Routes>
              <Route path="/" element={<HomeRoute />} />
              <Route path="/auth/:accountType" element={<AuthPage mode="login" />} />
              <Route path="/register/:accountType" element={<AuthPage mode="register" />} />
              <Route path="/login" element={<AuthPage mode="login" />} />
              <Route element={<RequireAuthentication />}>
                <Route path="/onboarding" element={<OnboardingRoute />} />
                <Route path="/:accountType" element={<AccountTypeRoute />}>
                  <Route element={<AppLayout />}>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<DashboardPage />} />
                    <Route path="activity" element={<ActivityPage />} />
                    <Route path="activities" element={<ActivityPage />} />
                    <Route path="analytics" element={<DashboardPage />} />
                    <Route path="recommendations" element={<DashboardPage />} />
                    <Route path="reports" element={<DashboardPage />} />
                    <Route path="campus" element={<DashboardPage />} />
                    <Route path="departments" element={<DashboardPage />} />
                    <Route path="facilities" element={<DashboardPage />} />
                    <Route path="profile" element={<DashboardPage />} />
                    <Route path="settings" element={<DashboardPage />} />
                    <Route path="factors" element={<FactorsPage />} />
                    <Route path="assistant" element={<AssistantPage />} />
                  </Route>
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </WorkspaceProvider>
      </BrowserRouter>
    </MotionConfig>
  );
}

function HomeRoute() {
  const { auth, loading, error } = useWorkspace();
  if (loading) return <LoadingState />;
  if (error) return <div className="mx-auto max-w-xl p-8"><ErrorState message={error} /></div>;
  if (auth) return <Navigate to={auth.onboarding_complete ? `/${auth.user.account_type}/dashboard` : "/onboarding"} replace />;
  return <AccountSelectionPage />;
}

function RequireAuthentication() {
  const { auth, loading, error } = useWorkspace();
  if (loading) return <LoadingState />;
  if (error) return <div className="mx-auto max-w-xl p-8"><ErrorState message={error} /></div>;
  if (!auth) return <Navigate to="/" replace />;
  return <Outlet />;
}

function OnboardingRoute() {
  const { auth } = useWorkspace();
  if (!auth) return <Navigate to="/" replace />;
  if (auth.onboarding_complete) return <Navigate to={`/${auth.user.account_type}/dashboard`} replace />;
  return <OnboardingPage />;
}

function AccountTypeRoute() {
  const { accountType } = useParams();
  const { auth } = useWorkspace();
  if (!auth) return <Navigate to="/" replace />;
  if (!isAccountType(accountType)) {
    return <Navigate to={`/${auth.user.account_type}/dashboard`} replace />;
  }
  if (accountType !== auth.user.account_type) {
    return <Navigate to={`/${auth.user.account_type}/dashboard`} replace />;
  }
  if (!auth.onboarding_complete) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
