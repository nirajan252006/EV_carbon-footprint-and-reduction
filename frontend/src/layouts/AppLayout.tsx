import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BookOpenText,
  Building2,
  ChartNoAxesCombined,
  FileStack,
  GraduationCap,
  Layers,
  LogOut,
  Menu,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AssistantWidget } from "../components/AssistantWidget";
import { AmbientBackground } from "../components/AmbientBackground";
import { ThemeToggle } from "../components/ThemeToggle";
import { ErrorState } from "../components/Feedback";
import { useWorkspace } from "../hooks/WorkspaceContext";

const sharedNav = {
  dashboard: { path: "dashboard", label: "Dashboard", icon: ChartNoAxesCombined },
  activity: { path: "activity", label: "Activity Ledger", icon: Plus },
  factors: { path: "factors", label: "Emission Factors", icon: FileStack },
  assistant: { path: "assistant", label: "AI Climate Assistant", icon: BookOpenText },
};

const navItemsByAccount = {
  individual: [
    sharedNav.dashboard,
    sharedNav.activity,
    { path: "analytics", label: "Personal Analytics", icon: ChartNoAxesCombined },
    { path: "recommendations", label: "AI Insights", icon: Sparkles },
    { path: "reports", label: "Monthly Reports", icon: FileStack },
    { path: "profile", label: "Household Profile", icon: Users },
    sharedNav.assistant,
  ],
  college: [
    sharedNav.dashboard,
    sharedNav.activity,
    { path: "campus", label: "Campus Digital Twin", icon: GraduationCap },
    { path: "analytics", label: "Campus Analytics", icon: ChartNoAxesCombined },
    { path: "reduction-planner", label: "Reduction Planner", icon: Target },
    { path: "reports", label: "Campus Audit Report", icon: FileStack },
    sharedNav.assistant,
  ],
  organization: [
    sharedNav.dashboard,
    sharedNav.activity,
    { path: "facilities", label: "Multi-Site Operations", icon: Building2 },
    { path: "departments", label: "Scopes & Depts", icon: Layers },
    { path: "analytics", label: "Enterprise Analytics", icon: ChartNoAxesCombined },
    { path: "recommendations", label: "AI Operations Advisor", icon: Sparkles },
    { path: "reports", label: "ESG / CSR Reports", icon: FileStack },
    sharedNav.assistant,
  ],
};

export function AppLayout() {
  const { auth, workspace, logout } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const accountType = auth?.user.account_type ?? "individual";
  const navItems = navItemsByAccount[accountType];
  const activeLabel =
    navItems.find((item) => location.pathname.endsWith(`/${item.path}`))?.label ?? "Dashboard";

  async function signOut() {
    setLogoutError(null);
    try {
      await logout();
      navigate("/", { replace: true });
    } catch (reason) {
      setLogoutError(reason instanceof Error ? reason.message : "Sign out failed.");
    }
  }

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#080D1B] text-[#F4F7FF] transition-colors duration-300">
      {/* 5-Layer Ambient Animated Background Tailored to Account Type */}
      <AmbientBackground accountType={accountType} />

      {/* Desktop Sidebar with Glassmorphic Digital Climate Intelligence (Strictly No Green) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-white/10 bg-[#0D142A]/85 px-5 py-6 text-[#F4F7FF] shadow-[22px_0_40px_-30px_rgba(0,0,0,0.85)] backdrop-blur-2xl lg:flex">
        <Brand />

        {/* Experience Indicator Badge */}
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-1.5 text-xs">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-semibold text-cyan-400 capitalize">{accountType} Portal</span>
        </div>

        <nav className="mt-6 min-h-0 flex-1 overflow-y-auto pr-1" aria-label="Main navigation">
          <div className="grid gap-1.5">
            {navItems.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={`/${accountType}/${path}`}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    isActive
                      ? "border-l-4 border-cyan-400 bg-gradient-to-r from-cyan-950/80 to-[#17102B] font-semibold text-cyan-400 shadow-glow-cyan"
                      : "text-[#A8B3CC] hover:bg-white/[0.04] hover:text-white"
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110" aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Traceable Factor Guarantee Box */}
        <div className="mt-4 shrink-0 rounded-2xl border border-white/10 bg-[#17102B]/85 p-3.5 shadow-inner">
          <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300">
            <ShieldCheck className="h-4 w-4 text-cyan-400 shrink-0" />
            <span>Deterministic Verification</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-[#A8B3CC]">
            Calculations preserve raw factor audits, GPS deltas & OCR evidence.
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="relative z-10 lg:pl-72">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/10 bg-[#080D1B]/85 px-4 backdrop-blur-2xl sm:px-7">
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg p-2 text-[#A8B3CC] hover:bg-white/10 lg:hidden"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <p className="text-xs text-[#A8B3CC]">
              Workspace <span className="mx-2 opacity-50">/</span>
              <strong className="font-medium text-[#F4F7FF]">{activeLabel}</strong>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />

            <div className="h-4 w-px bg-white/10 hidden sm:block" />

            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 text-xs font-bold text-cyan-400 border border-cyan-400/30">
                {workspace?.name.slice(0, 2).toUpperCase() ?? "GT"}
              </span>
              <span className="hidden max-w-44 truncate sm:inline text-left">
                <span className="block text-xs font-semibold text-[#F4F7FF] truncate">
                  {workspace?.name ?? "Workspace"}
                </span>
                <span className="block text-[10px] text-[#A8B3CC] truncate">
                  {auth?.user.role} · {auth?.user.email}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-transparent px-2.5 text-xs font-semibold text-[#A8B3CC] transition hover:bg-white/5 hover:text-rose-400"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>
        </header>

        {menuOpen && (
          <nav
            className="absolute z-20 max-h-[calc(100vh-4rem)] w-full overflow-y-auto border-b border-white/10 bg-[#0D142A]/95 p-4 shadow-2xl backdrop-blur-2xl lg:hidden"
            aria-label="Mobile navigation"
          >
            <div className="grid gap-1.5">
              {navItems.map(({ path, label, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={`/${accountType}/${path}`}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium ${
                      isActive
                        ? "bg-cyan-950/70 font-semibold text-cyan-400 border-l-4 border-cyan-400"
                        : "text-[#A8B3CC] hover:bg-white/5"
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}

        <main className="mx-auto max-w-[1560px] px-4 py-8 sm:px-7 lg:px-9">
          {logoutError && (
            <div className="mb-4">
              <ErrorState message={logoutError} />
            </div>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>

          <footer className="mt-14 flex flex-wrap justify-between gap-3 border-t border-white/10 pt-5 text-[11px] text-[#A8B3CC]">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              GreenTrack · Digital Climate Intelligence (PS-01)
            </span>
            <span>Deterministic emission factors · GPS accuracy filtering · Explainable AI</span>
          </footer>
        </main>
      </div>
      <AssistantWidget accountType={accountType} />
    </div>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-3 group">
      <div className="relative">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-400 via-hologram-blue to-violet-500 font-black text-[#080D1B] shadow-glow-cyan transition-transform group-hover:scale-105">
          G
        </span>
        <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-cyan-400 ring-2 ring-[#0D142A] animate-pulse" />
      </div>
      <div>
        <span className="text-base font-bold tracking-tight text-[#F4F7FF] flex items-center gap-1.5">
          GreenTrack
          <span className="rounded-full bg-cyan-400/20 px-1.5 py-0.5 text-[9px] font-bold text-cyan-400 border border-cyan-400/30">
            PRO
          </span>
        </span>
        <span className="block text-[9px] font-semibold tracking-[0.18em] text-[#A8B3CC]">
          CLIMATE INTELLIGENCE
        </span>
      </div>
    </Link>
  );
}
