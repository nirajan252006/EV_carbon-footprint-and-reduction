import { lazy, Suspense } from "react";
import { MotionConfig } from "framer-motion";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/Feedback";
import { useWorkspace, WorkspaceProvider } from "../hooks/WorkspaceContext";
import { AppLayout } from "../layouts/AppLayout";
import { OnboardingPage } from "../pages/OnboardingPage";

const DashboardPage = lazy(() => import("../pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const ActivityPage = lazy(() => import("../pages/ActivityPage").then((module) => ({ default: module.ActivityPage })));
const FactorsPage = lazy(() => import("../pages/FactorsPage").then((module) => ({ default: module.FactorsPage })));
const AssistantPage = lazy(() => import("../pages/AssistantPage").then((module) => ({ default: module.AssistantPage })));

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <WorkspaceProvider>
          <Suspense fallback={<LoadingState />}>
            <Routes>
              <Route path="/onboarding" element={<OnboardingRoute />} />
              <Route element={<WorkspaceRoute />}>
                <Route element={<AppLayout />}>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/activity" element={<ActivityPage />} />
                  <Route path="/factors" element={<FactorsPage />} />
                  <Route path="/assistant" element={<AssistantPage />} />
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

function OnboardingRoute() {
  const { loading, error } = useWorkspace();
  if (loading) return <LoadingState />;
  if (error) return <div className="mx-auto max-w-xl p-8"><ErrorState message={error} /></div>;
  return <OnboardingPage />;
}

function WorkspaceRoute() {
  const { workspace, loading, error } = useWorkspace();
  if (loading) return <LoadingState />;
  if (error) return <div className="mx-auto max-w-xl p-8"><ErrorState message={error} /></div>;
  if (!workspace) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
