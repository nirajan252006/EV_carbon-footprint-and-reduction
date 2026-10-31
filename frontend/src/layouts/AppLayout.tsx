import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BookOpenText,
  ChartNoAxesCombined,
  FileStack,
  Leaf,
  LogOut,
  Menu,
  Plus,
  ShieldCheck,
  Target,
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
  activity: { path: "activity", label: "Activity log", icon: Plus },
  factors: { path: "factors", label: "Emission factors", icon: FileStack },
  assistant: { path: "assistant", label: "Knowledge assistant", icon: BookOpenText },
};

const navItemsByAccount = {
  individual: [
    sharedNav.dashboard,
    sharedNav.activity,
    { path: "analytics", label: "My analytics", icon: ChartNoAxesCombined },
    { path: "recommendations", label: "Recommendations", icon: Leaf },
    { path: "reports", label: "Reports", icon: FileStack },
    { path: "profile", label: "My profile", icon: Plus },
    sharedNav.assistant,
  ],
  college: [
    sharedNav.dashboard,
    { path: "analytics", label: "Campus analytics", icon: ChartNoAxesCombined },
    { path: "reduction-planner", label: "Carbon reduction planner", icon: Target },
    sharedNav.assistant,
  ],
  organization: [
    sharedNav.dashboard,
    { path: "facilities", label: "Facilities", icon: Plus },
    { path: "departments", label: "Departments", icon: FileStack },
    { path: "activities", label: "Organization activities", icon: Plus },
    { path: "analytics", label: "Analytics", icon: ChartNoAxesCombined },
    { path: "recommendations", label: "Recommendations", icon: Leaf },
    { path: "reports", label: "Management reports", icon: FileStack },
    { path: "settings", label: "Settings", icon: Plus },
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
    <div className="relative isolate min-h-screen overflow-hidden bg-[#F7F5F0] text-[#18263A] dark:bg-darkbg dark:text-slate-100 transition-colors duration-300">
      <AmbientBackground />

      {/* Desktop Sidebar with Glassmorphic cyber eco style */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-[#E4E6E8] bg-white/80 px-5 py-6 text-slate-800 shadow-[22px_0_40px_-32px_rgba(49,92,133,0.18)] backdrop-blur-xl lg:flex dark:border-white/10 dark:bg-[#0D1B2A]/85 dark:text-slate-100 dark:shadow-[22px_0_40px_-30px_rgba(0,0,0,0.8)]">
        <Brand />

        <nav className="mt-8 min-h-0 flex-1 overflow-y-auto pr-1" aria-label="Main navigation">
          <div className="grid gap-1.5">
            {navItems.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={`/${accountType}/${path}`}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    isActive
                      ? "bg-gradient-to-r from-emerald-50 to-teal-50 font-semibold text-emerald-800 shadow-[0_4px_16px_-4px_rgba(16,185,129,0.3)] border-l-4 border-emerald-500 dark:border-ecogreen dark:bg-gradient-to-r dark:from-emerald-950/60 dark:to-[#0D1B2A] dark:text-ecogreen dark:shadow-glow-green"
                      : "text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/[0.04] dark:hover:text-white"
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110" aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Evidence First / Hardware Trust Status Pill */}
        <div className="mt-4 shrink-0 rounded-2xl border border-[#DCE6F5] bg-white/70 p-3.5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-[#12243A]/80 dark:shadow-inner">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-ecogreen shrink-0" />
            <span>Deterministic Verified</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Every calculation preserves raw factors, meter deltas & audit formulas.
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="relative z-10 lg:pl-72">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#E4E6E8] bg-white/80 px-4 backdrop-blur-xl sm:px-7 dark:border-white/10 dark:bg-[#07111F]/80">
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-white/10"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <p className="text-xs text-slate-400 dark:text-slate-400">
              Workspace <span className="mx-2 opacity-50">/</span>
              <strong className="font-medium text-slate-700 dark:text-slate-200">{activeLabel}</strong>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle Button */}
            <ThemeToggle />

            <div className="h-4 w-px bg-slate-200 dark:bg-white/10 hidden sm:block" />

            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 text-xs font-bold text-emerald-700 dark:text-ecogreen border border-emerald-500/30">
                {workspace?.name.slice(0, 2).toUpperCase() ?? "GT"}
              </span>
              <span className="hidden max-w-44 truncate sm:inline text-left">
                <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {workspace?.name ?? "Workspace"}
                </span>
                <span className="block text-[10px] text-slate-400 dark:text-slate-400 truncate">
                  {auth?.user.role} · {auth?.user.email}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-transparent px-2.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-rose-400"
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
            className="absolute z-20 max-h-[calc(100vh-4rem)] w-full overflow-y-auto border-b border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur-xl lg:hidden dark:border-white/10 dark:bg-[#0D1B2A]/95"
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
                        ? "bg-emerald-50 font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-ecogreen"
                        : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
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

        <main className="mx-auto max-w-[1540px] px-4 py-8 sm:px-7 lg:px-9">
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

          <footer className="mt-14 flex flex-wrap justify-between gap-3 border-t border-slate-200/80 pt-5 text-[11px] text-slate-400 dark:border-white/10 dark:text-slate-500">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-ecogreen animate-pulse" />
              GreenTrack 2.0 · Autonomous Carbon Intelligence
            </span>
            <span>Deterministic factor-verified calculations · High-frequency IoT stream</span>
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
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 font-black text-white shadow-md dark:shadow-glow-green dark:text-darkbg transition-transform group-hover:scale-105">
          G
        </span>
        <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-white dark:bg-ecogreen dark:ring-darksurface animate-pulse" />
      </div>
      <div>
        <span className="text-base font-bold tracking-tight text-slate-800 dark:text-white flex items-center gap-1.5">
          GreenTrack
          <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 dark:bg-ecogreen/20 dark:text-ecogreen border border-emerald-500/20">
            2.0
          </span>
        </span>
        <span className="block text-[9px] font-semibold tracking-[0.18em] text-slate-400 dark:text-slate-400">
          CARBON INTELLIGENCE
        </span>
      </div>
    </Link>
  );
}
