import { motion } from "framer-motion";
import { BarChart3, Building2, Download, GraduationCap, Printer, Save, Users } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState, ErrorState, LoadingState, SuccessState } from "../components/Feedback";
import { PageHeader } from "../components/PageHeader";
import { useWorkspace } from "../hooks/WorkspaceContext";
import { api } from "../services/api";
import type { Activity, DashboardData, Recommendation } from "../types/api";

const colors = { electricity: "#4266E5", transport: "#8061DB", fuel: "#F59E0B", waste: "#8EA1B5" };

function currentPeriod() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function money(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

export function CampusProfilePage() {
  const { workspace, refresh } = useWorkspace();
  const profile = workspace?.profile;
  const [name, setName] = useState(workspace?.name ?? "");
  const [institution, setInstitution] = useState(profile?.institution_name ?? workspace?.name ?? "");
  const [department, setDepartment] = useState(profile?.department ?? "");
  const [region, setRegion] = useState(workspace?.region ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace) return;
    setName(workspace.name);
    setInstitution(workspace.profile?.institution_name ?? workspace.name);
    setDepartment(workspace.profile?.department ?? "");
    setRegion(workspace.region);
  }, [workspace]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(null); setNotice(null);
    try {
      await api.saveWorkspace({ name, account_type: "college", region, profile_name: institution, profile_detail: department });
      await refresh();
      setNotice("Campus profile saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Campus profile could not be saved.");
    } finally { setSaving(false); }
  }

  return <div>
    <PageHeader eyebrow="COLLEGE WORKSPACE" title="Campus" highlight="profile and identity." description="Manage the institution details attached to College workspace reports. Building and student capacity data is not changed here unless supported by the backend." />
    {error && <div className="mb-4"><ErrorState message={error} /></div>}
    {notice && <div className="mb-4"><SuccessState message={notice} /></div>}
    <form onSubmit={save} className="surface-card max-w-3xl p-5 sm:p-7">
      <div className="mb-6 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-ice text-leaf"><GraduationCap className="h-5 w-5" /></span><div><h2 className="text-sm font-semibold text-slate-800">Institution settings</h2><p className="mt-1 text-xs text-slate-400">Authorized workspace administrators can edit these fields.</p></div></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="form-label">Workspace name<input className="form-input" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="form-label">Institution name<input className="form-input" required minLength={2} value={institution} onChange={(e) => setInstitution(e.target.value)} /></label>
        <label className="form-label">Campus location<input className="form-input" value={department} onChange={(e) => setDepartment(e.target.value)} /></label>
        <label className="form-label">Reporting region<input className="form-input" required minLength={2} value={region} onChange={(e) => setRegion(e.target.value)} /></label>
      </div>
      <button type="submit" className="btn-primary mt-6" disabled={saving}><Save className="h-4 w-4" />{saving ? "Saving…" : "Save campus profile"}</button>
    </form>
  </div>;
}

export function CollegeAnalyticsPage() {
  const [period, setPeriod] = useState(currentPeriod);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const [summary, records] = await Promise.all([api.getDashboard(period), api.getActivities(period)]); setDashboard(summary); setActivities(records); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Analytics could not be loaded."); }
    finally { setLoading(false); }
  }, [period]);
  useEffect(() => { void load(); }, [load]);

  if (loading && !dashboard) return <LoadingState label="Loading campus analytics…" />;

  return <div>
    <PageHeader eyebrow="COLLEGE ANALYTICS" title="Campus emissions" highlight="analytics." description="Every chart below is derived from saved activities in the selected workspace and reporting period." />
    <label className="form-label mb-5 max-w-48">Reporting month<input className="form-input" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></label>
    {error && <div className="mb-4"><ErrorState message={error} /></div>}
    {dashboard && <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[{label:"MONTHLY EMISSIONS",value:`${money(dashboard.total_kg)} kg`,icon:BarChart3},{label:"ACTIVITY COUNT",value:String(dashboard.activity_count),icon:Building2},{label:"CATEGORY COVERAGE",value:`${dashboard.categories.length} / 4`,icon:Users},{label:"PERIOD BASELINE",value:dashboard.previous_total_kg ? `${money(dashboard.previous_total_kg)} kg` : "—",icon:GraduationCap}].map(({label,value,icon:Icon}) =>
          <motion.article key={label} initial={{opacity:0,y:7}} animate={{opacity:1,y:0}} className="surface-card p-5"><div className="flex items-center justify-between"><span className="text-[9px] font-bold tracking-wider text-slate-400">{label}</span><Icon className="h-4 w-4 text-leaf" /></div><p className="mt-3 text-2xl font-semibold text-forest">{value}</p></motion.article>)}
      </section>
      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <article className="surface-card p-5"><h2 className="text-sm font-semibold text-slate-800">Category contribution</h2><p className="mt-1 text-xs text-slate-400">Measured emissions · kg CO₂e</p>{dashboard.categories.length ? <div className="mt-4 h-72"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dashboard.categories} dataKey="emissions_kg" nameKey="category" innerRadius={58} outerRadius={96} paddingAngle={4}>{dashboard.categories.map((item) => <Cell key={item.category} fill={colors[item.category]} />)}</Pie><Tooltip formatter={(value) => [`${money(Number(value))} kg CO₂e`, "Emissions"]}/><Legend /></PieChart></ResponsiveContainer></div> : <EmptyState>No category emissions in this period.</EmptyState>}</article>
        <article className="surface-card p-5"><h2 className="text-sm font-semibold text-slate-800">Daily emissions</h2><p className="mt-1 text-xs text-slate-400">Saved records grouped by activity date</p>{dashboard.daily.length ? <div className="mt-4 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard.daily}><CartesianGrid stroke="#E4E9F2" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="activity_date" tickFormatter={(v) => String(v).slice(8,10)}/><YAxis/><Tooltip formatter={(value) => [`${money(Number(value))} kg CO₂e`, "Emissions"]}/><Bar dataKey="emissions_kg" fill="#4266E5" radius={[5,5,0,0]} /></BarChart></ResponsiveContainer></div> : <EmptyState>No daily records in this period.</EmptyState>}</article>
      </section>
      <article className="surface-card mt-4 p-5"><h2 className="text-sm font-semibold text-slate-800">Recent campus records</h2>{activities.length ? <div className="mt-4 divide-y divide-slate-100">{activities.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium text-slate-700">{item.description}</p><p className="mt-1 text-xs capitalize text-slate-400">{item.category} · {item.activity_date ?? item.period} · {item.reporting_unit || "No facility tag"}</p></div><strong className="text-sm text-forest">{money(item.emissions_kg)} kg CO₂e</strong></div>)}</div> : <EmptyState>No campus activities saved in this period.</EmptyState>}</article>
    </>}
  </div>;
}

export function CollegeRecommendationsPage() {
  const [period,setPeriod]=useState(currentPeriod);
  const [items,setItems]=useState<Recommendation[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  useEffect(()=>{let active=true;setLoading(true);api.getRecommendations(period).then((data)=>active&&setItems(data)).catch((reason)=>active&&setError(reason instanceof Error?reason.message:"Recommendations could not be loaded.")).finally(()=>active&&setLoading(false));return()=>{active=false}},[period]);
  if(loading)return <LoadingState label="Building measured reduction prompts…"/>;
  return <div><PageHeader eyebrow="COLLEGE INITIATIVES" title="Sustainability" highlight="recommendations." description="Planning prompts are derived from measured categories. They are not achieved reductions."/><label className="form-label mb-5 max-w-48">Reporting month<input className="form-input" type="month" value={period} onChange={(e)=>setPeriod(e.target.value)}/></label>{error&&<ErrorState message={error}/>}<div className="grid gap-3 md:grid-cols-2">{items.map((item,index)=><motion.article key={`${item.category}-${index}`} initial={{opacity:0,y:7}} animate={{opacity:1,y:0}} className="surface-card p-5"><div className="flex items-center justify-between"><span className="rounded-full bg-ice px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-leaf">{item.category}</span><span className="text-xs text-slate-400">Planning priority</span></div><p className="mt-4 text-sm text-slate-600">{item.reason}</p><p className="mt-3 font-semibold text-slate-800">{item.action}</p>{item.estimated_savings_kg!==null&&<p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-blue-700">Planning scenario: {money(item.estimated_savings_kg)} kg CO₂e · {item.savings_note}</p>}</motion.article>)}</div>{!items.length&&!error&&<EmptyState>Recommendations appear after a category has measured activity.</EmptyState>}</div>;
}

export function CollegeReportsPage() {
  const [period,setPeriod]=useState(currentPeriod);
  const [dashboard,setDashboard]=useState<DashboardData|null>(null);
  const [activities,setActivities]=useState<Activity[]>([]);
  const [explanation,setExplanation]=useState<{explanation:string;ai_generated:boolean}|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const load=useCallback(async()=>{setLoading(true);setError(null);try{const[d,a,e]=await Promise.all([api.getDashboard(period),api.getActivities(period),api.getCarbonExplanation(period)]);setDashboard(d);setActivities(a);setExplanation(e)}catch(reason){setError(reason instanceof Error?reason.message:"Report could not be loaded.")}finally{setLoading(false)}},[period]);
  useEffect(()=>{void load()},[load]);
  async function download(){setBusy(true);setError(null);try{const blob=await api.report(period);const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`college-report-${period}.csv`;a.click();URL.revokeObjectURL(url)}catch(reason){setError(reason instanceof Error?reason.message:"CSV export failed.")}finally{setBusy(false)}}
  if(loading&&!dashboard)return <LoadingState label="Preparing college report…"/>;
  return <div className="print:bg-white"><PageHeader eyebrow="COLLEGE REPORTING" title="Campus" highlight="reports." description="The print view and CSV export use saved workspace records only." action={<div className="flex gap-2"><button type="button" className="btn-secondary" onClick={()=>window.print()}><Printer className="h-4 w-4"/>Print</button><button type="button" className="btn-primary" onClick={()=>void download()} disabled={busy}><Download className="h-4 w-4"/>{busy?"Exporting…":"Download CSV"}</button></div>} /><label className="form-label mb-5 max-w-48">Reporting month<input className="form-input" type="month" value={period} onChange={(e)=>setPeriod(e.target.value)}/></label>{error&&<div className="mb-4"><ErrorState message={error}/></div>}{dashboard&&<><section className="surface-card p-5 sm:p-7"><div className="grid gap-4 sm:grid-cols-3"><div><p className="text-xs text-slate-400">TOTAL EMISSIONS</p><p className="mt-2 text-2xl font-semibold text-forest">{money(dashboard.total_kg)} kg CO₂e</p></div><div><p className="text-xs text-slate-400">ACTIVITY RECORDS</p><p className="mt-2 text-2xl font-semibold text-forest">{dashboard.activity_count}</p></div><div><p className="text-xs text-slate-400">PREVIOUS PERIOD</p><p className="mt-2 text-2xl font-semibold text-forest">{money(dashboard.previous_total_kg)} kg CO₂e</p></div></div></section>{explanation&&<article className="surface-card mt-4 p-5"><p className="text-[10px] font-bold tracking-wider text-leaf">{explanation.ai_generated?"AI-ASSISTED EXPLANATION":"DETERMINISTIC SUMMARY"}</p><p className="mt-3 text-sm leading-7 text-slate-700">{explanation.explanation}</p></article>}<article className="surface-card mt-4 p-5"><h2 className="text-sm font-semibold text-slate-800">Activity breakdown</h2>{activities.length?<div className="mt-4 divide-y divide-slate-100">{activities.map((item)=><div key={item.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_160px_130px]"><div><p className="text-sm font-medium text-slate-700">{item.description}</p><p className="mt-1 text-xs capitalize text-slate-400">{item.category} · {item.activity_date ?? item.period}</p></div><p className="text-xs text-slate-500">{item.quantity} {item.unit}</p><strong className="text-sm text-forest">{money(item.emissions_kg)} kg CO₂e</strong></div>)}</div>:<EmptyState>No activity records exist for this reporting period.</EmptyState>}</article></>}</div>;
}

export function CollegeCapabilityPage({kind}:{kind:"facilities"|"departments"}) {
  const isFacility=kind==="facilities";
  return <div><PageHeader eyebrow="COLLEGE WORKSPACE" title={isFacility?"Campus facilities":"Departments"} highlight={isFacility?"and buildings.":"and campus units."} description={isFacility?"Facilities require building and area records before comparisons are meaningful.":"Department reporting requires activity and department association fields."}/><section className="surface-card p-6"><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lavender text-violet">{isFacility?<Building2 className="h-5 w-5"/>:<Users className="h-5 w-5"/>}</span><div><h2 className="text-sm font-semibold text-slate-800">Backend capability not configured</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{isFacility?"The current database does not store buildings, floor areas, or facility-to-activity associations. This page intentionally shows no fabricated facilities or emissions.":"The current database does not store departments or department-to-activity associations. This page intentionally shows no fabricated units or emissions."}</p><p className="mt-3 text-xs text-slate-400">Use the Campus activity form and workspace profile until these models are implemented through a migration with authorization tests.</p></div></div></section></div>;
}
