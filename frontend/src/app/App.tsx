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
const CampusProfilePage = lazy(() => import("../pages/CollegePortalPages").then((module) => ({ default: module.CampusProfilePage })));
const AdvancedAnalyticsPage = lazy(() => import("../pages/AdvancedAnalyticsPage").then((module) => ({ default: module.AdvancedAnalyticsPage })));
const CollegeAnalyticsPage = lazy(() => import("../pages/CollegePortalPages").then((module) => ({ default: module.CollegeAnalyticsPage })));
const CollegeRecommendationsPage = lazy(() => import("../pages/CollegePortalPages").then((module) => ({ default: module.CollegeRecommendationsPage })));
const CollegeReportsPage = lazy(() => import("../pages/CollegePortalPages").then((module) => ({ default: module.CollegeReportsPage })));
const CollegeCapabilityPage = lazy(() => import("../pages/CollegePortalPages").then((module) => ({ default: module.CollegeCapabilityPage })));
const ReductionPlannerPage = lazy(() => import("../pages/CollegeManagementPages").then((module) => ({ default: module.ReductionPlannerPage })));
const SustainabilityGoalsPage = lazy(() => import("../pages/CollegeManagementPages").then((module) => ({ default: module.SustainabilityGoalsPage })));
const CollegeDataExchangePage = lazy(() => import("../pages/CollegeManagementPages").then((module) => ({ default: module.CollegeDataExchangePage })));
const CollegeNotificationsPage = lazy(() => import("../pages/CollegeManagementPages").then((module) => ({ default: module.CollegeNotificationsPage })));

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
                    <Route path="analytics" element={<CollegeAnalyticsRoute />} />
                    <Route path="recommendations" element={<CollegeRecommendationsRoute />} />
                    <Route path="reports" element={<CollegeReportsRoute />} />
                    <Route path="campus" element={<CollegeCampusRoute />} />
                    <Route path="departments" element={<CollegeDepartmentsRoute />} />
                    <Route path="facilities" element={<CollegeFacilitiesRoute />} />
                    <Route path="profile" element={<CollegeProfileRoute />} />
                    <Route path="settings" element={<CollegeSettingsRoute />} />
                    <Route path="inventory" element={<CollegeInventoryRoute />} />
                    <Route path="reduction-planner" element={<CollegeReductionPlannerRoute />} />
                    <Route path="goals" element={<CollegeGoalsRoute />} />
                    <Route path="data-exchange" element={<CollegeDataExchangeRoute />} />
                    <Route path="notifications" element={<CollegeNotificationsRoute />} />
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

function CollegeAnalyticsRoute() {
  return <AdvancedAnalyticsPage />;
}

function CollegeRecommendationsRoute() {
  const { auth } = useWorkspace();
  return auth?.user.account_type === "college" ? <CollegeRecommendationsPage /> : <DashboardPage />;
}

function CollegeReportsRoute() {
  const { auth } = useWorkspace();
  return auth?.user.account_type === "college" ? <CollegeReportsPage /> : <DashboardPage />;
}

function CollegeCampusRoute() {
  const { auth } = useWorkspace();
  return auth?.user.account_type === "college" ? <CampusProfilePage /> : <DashboardPage />;
}

function CollegeProfileRoute() {
  const { auth } = useWorkspace();
  return auth?.user.account_type === "college" ? <CampusProfilePage /> : <DashboardPage />;
}

function CollegeSettingsRoute() {
  const { auth } = useWorkspace();
  return auth?.user.account_type === "college" ? <CampusProfilePage /> : <DashboardPage />;
}

function CollegeDepartmentsRoute() {
  const { auth } = useWorkspace();
  return auth?.user.account_type === "college" ? <CollegeCapabilityPage kind="departments" /> : <DashboardPage />;
}

function CollegeFacilitiesRoute() {
  const { auth } = useWorkspace();
  return auth?.user.account_type === "college" ? <CollegeCapabilityPage kind="facilities" /> : <DashboardPage />;
}

function CollegeInventoryRoute() {
  const { auth } = useWorkspace();
  return auth?.user.account_type === "college" ? <CollegeAnalyticsPage /> : <DashboardPage />;
}

function CollegeReductionPlannerRoute() {
  const { auth } = useWorkspace();
  return auth?.user.account_type === "college" ? <ReductionPlannerPage /> : <DashboardPage />;
}

function CollegeGoalsRoute() {
  const { auth } = useWorkspace();
  return auth?.user.account_type === "college" ? <SustainabilityGoalsPage /> : <DashboardPage />;
}

function CollegeDataExchangeRoute() {
  const { auth } = useWorkspace();
  return auth?.user.account_type === "college" ? <CollegeDataExchangePage /> : <DashboardPage />;
}

function CollegeNotificationsRoute() {
  const { auth } = useWorkspace();
  return auth?.user.account_type === "college" ? <CollegeNotificationsPage /> : <DashboardPage />;
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
