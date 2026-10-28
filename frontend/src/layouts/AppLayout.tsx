import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BookOpenText,
  ChartNoAxesCombined,
  FileStack,
  Leaf,
  LogOut,
  Menu,
  Plus,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ErrorState } from "../components/Feedback";
import { useWorkspace } from "../hooks/WorkspaceContext";

const navItems = [
  { path: "dashboard", label: "Dashboard", icon: ChartNoAxesCombined },
  { path: "activity", label: "Activity log", icon: Plus },
  { path: "factors", label: "Emission factors", icon: FileStack },
  { path: "assistant", label: "Knowledge assistant", icon: BookOpenText },
];

export function AppLayout() {
  const { auth, workspace, logout } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const accountType = auth?.user.account_type ?? "individual";
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
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-forest px-5 py-6 text-white lg:flex">
        <Brand />
        <p className="mb-3 mt-14 px-3 text-[10px] font-bold tracking-[0.18em] text-emerald-200/50">WORKSPACE</p>
        <nav className="grid gap-1" aria-label="Main navigation">
          {navItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={`/${accountType}/${path}`}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${
                  isActive ? "bg-white/10 font-medium text-white" : "text-emerald-100/65 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2 text-sm font-medium"><Leaf className="h-4 w-4 text-emerald-300" /> Evidence first</div>
          <p className="mt-1 text-xs leading-5 text-emerald-100/55">Every calculation keeps its factor source.</p>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md sm:px-7">
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
              <span className="block text-[10px] text-slate-400">{auth?.user.role} · {auth?.user.email}</span>
            </span>
            <button type="button" onClick={() => void signOut()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-forest" aria-label="Sign out">
              <LogOut className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        {menuOpen && (
          <nav className="absolute z-20 grid w-full gap-1 border-b border-slate-200 bg-white p-3 shadow-lg lg:hidden" aria-label="Mobile navigation">
            {navItems.map(({ path, label, icon: Icon }) => (
              <NavLink key={path} to={`/${accountType}/${path}`} onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:bg-mint">
                <Icon className="h-4 w-4" />{label}
              </NavLink>
            ))}
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
            <span>GreenTrack · local prototype</span>
            <span>Deterministic calculations are separate from optional document RAG.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-3 text-white">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-200 font-bold text-forest">G</span>
      <span className="text-sm font-bold tracking-tight">GreenTrack<span className="mt-0.5 block text-[8px] font-semibold tracking-[0.16em] text-emerald-100/50">CARBON INTELLIGENCE</span></span>
    </Link>
  );
}
