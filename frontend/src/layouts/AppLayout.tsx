import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BookOpenText,
  ChartNoAxesCombined,
  FileStack,
  Leaf,
  LogOut,
  Menu,
  Plus,
  Target,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AssistantWidget } from "../components/AssistantWidget";
import { AmbientBackground } from "../components/AmbientBackground";
import { ErrorState } from "../components/Feedback";
import { useWorkspace } from "../hooks/WorkspaceContext";

const sharedNav = {
  dashboard: { path: "dashboard", label: "Dashboard", icon: ChartNoAxesCombined },
  activity: { path: "activity", label: "Activity log", icon: Plus },
  factors: { path: "factors", label: "Emission factors", icon: FileStack },
  assistant: { path: "assistant", label: "Knowledge assistant", icon: BookOpenText },
};

const navItemsByAccount = {
  individual: [sharedNav.dashboard, sharedNav.activity, { path: "analytics", label: "My analytics", icon: ChartNoAxesCombined }, { path: "recommendations", label: "Recommendations", icon: Leaf }, { path: "reports", label: "Reports", icon: FileStack }, { path: "profile", label: "My profile", icon: Plus }, sharedNav.assistant],
  college: [sharedNav.dashboard, { path: "analytics", label: "Campus analytics", icon: ChartNoAxesCombined }, { path: "reduction-planner", label: "Carbon reduction planner", icon: Target }, sharedNav.assistant],
  organization: [sharedNav.dashboard, { path: "facilities", label: "Facilities", icon: Plus }, { path: "departments", label: "Departments", icon: FileStack }, { path: "activities", label: "Organization activities", icon: Plus }, { path: "analytics", label: "Analytics", icon: ChartNoAxesCombined }, { path: "recommendations", label: "Recommendations", icon: Leaf }, { path: "reports", label: "Management reports", icon: FileStack }, { path: "settings", label: "Settings", icon: Plus }, sharedNav.assistant],
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
  const activeLabel = navItems.find((item) => location.pathname.endsWith(`/${item.path}`))?.label ?? "Dashboard";

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
    <div className="relative isolate min-h-screen overflow-hidden bg-[#F7F5F0] text-[#18263A]">
      <AmbientBackground />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-[#E4E6E8] bg-white/80 px-4 py-6 text-midnight shadow-[22px_0_40px_-32px_rgba(49,92,133,0.22)] backdrop-blur-md lg:flex">
        <Brand />
        <nav className="mt-10 min-h-0 flex-1 overflow-y-auto pr-1" aria-label="Main navigation">
          <div className="grid gap-1">{navItems.map(({ path, label, icon: Icon }) => <NavLink key={path} to={`/${accountType}/${path}`} className={({ isActive }) => `flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315C85] ${isActive ? "bg-[#EAF0F6] font-semibold text-[#315C85] shadow-[0_12px_22px_-18px_rgba(49,92,133,0.6)]" : "text-slate-500 hover:bg-white hover:text-[#17233D]"}`}><Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{label}</span></NavLink>)}</div>
        </nav>
        <div className="mt-3 shrink-0 rounded-2xl border border-[#DCE6F5] bg-[#F2F7FC] p-3 shadow-[0_20px_30px_-24px_rgba(49,92,133,0.5)]">
          <div className="flex items-center gap-2 text-sm font-medium text-[#17233D]"><Leaf className="h-4 w-4 text-[#315C85]" /> Evidence first</div>
          <p className="mt-1 text-xs leading-5 text-slate-500">Every calculation keeps its factor source.</p>
        </div>
      </aside>

      <div className="relative z-10 lg:pl-72">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[#E4E6E8] bg-white/75 px-4 backdrop-blur-xl sm:px-7">
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <p className="text-xs text-slate-400">Workspace <span className="mx-2">/</span><strong className="font-medium text-slate-600">{activeLabel}</strong></p>
          </div>
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-mint text-[10px] font-bold text-leaf">
              {workspace?.name.slice(0, 2).toUpperCase() ?? "GT"}
            </span>
            <span className="hidden max-w-40 truncate sm:inline">
              <span className="block text-xs font-medium text-slate-700">{workspace?.name ?? "Workspace"}</span>
              <span className="block text-[10px] text-slate-400">{auth?.user.role}  ·  {auth?.user.email}</span>
            </span>
            <button type="button" onClick={() => void signOut()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-forest" aria-label="Sign out">
              <LogOut className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        {menuOpen && (
          <nav className="absolute z-20 max-h-[calc(100vh-4rem)] w-full overflow-y-auto border-b border-slate-200 bg-white p-3 shadow-lg lg:hidden" aria-label="Mobile navigation">
            {navItems.map(({ path, label, icon: Icon }) => <NavLink key={path} to={`/${accountType}/${path}`} onClick={() => setMenuOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${isActive ? "bg-ice font-semibold text-leaf" : "text-slate-600 hover:bg-slate-50"}`}><Icon className="h-4 w-4" />{label}</NavLink>)}
          </nav>
        )}

        <main className="mx-auto max-w-[1500px] px-4 py-7 sm:px-7 lg:px-9">
          {logoutError && <div className="mb-4"><ErrorState message={logoutError} /></div>}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={reduceMotion ? false : { opacity: 0, y: 7 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
          <footer className="mt-10 flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-4 text-[11px] text-slate-400">
            <span>GreenTrack  ·  local prototype</span>
            <span>Deterministic calculations are separate from optional document RAG.</span>
          </footer>
        </main>
      </div>
      <AssistantWidget accountType={accountType} />
    </div>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-3 text-forest">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-ice to-lavender font-bold text-leaf">G</span>
      <span className="text-sm font-bold tracking-tight">GreenTrack<span className="mt-0.5 block text-[8px] font-semibold tracking-[0.16em] text-slate-400">CARBON INTELLIGENCE</span></span>
    </Link>
  );
}
