import { ArrowRight, Building2, Leaf, School, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ErrorState } from "../components/Feedback";
import { useWorkspace } from "../hooks/WorkspaceContext";
import { api } from "../services/api";

const accountLabels = {
  individual: "Individual",
  college: "College",
  organization: "Organization",
} as const;

export function OnboardingPage() {
  const { auth, workspace, setWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const accountType = auth?.user.account_type;
  const [name, setName] = useState(workspace?.name ?? "");
  const [region, setRegion] = useState(workspace?.region ?? "");
  const [profileName, setProfileName] = useState(
    workspace?.profile?.institution_name ?? workspace?.profile?.organization_name ?? workspace?.name ?? "",
  );
  const [profileDetail, setProfileDetail] = useState(
    workspace?.profile?.department ?? workspace?.profile?.sector ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!auth || !accountType) return <Navigate to="/" replace />;
  if (auth.onboarding_complete) return <Navigate to={`/${accountType}/dashboard`} replace />;

  const ProfileIcon = accountType === "individual" ? UserRound : accountType === "college" ? School : Building2;
  const profileLabel = accountType === "college" ? "Institution name" : accountType === "organization" ? "Organization name" : "Personal workspace";
  const detailLabel = accountType === "college" ? "Department or campus unit" : "Industry or sector";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountType) return;
    setError(null);
    setSaving(true);
    try {
      const saved = await api.saveWorkspace({
        name: name.trim(),
        account_type: accountType,
        region: region.trim(),
        profile_name: profileName.trim(),
        profile_detail: profileDetail.trim(),
      });
      setWorkspace(saved);
      navigate(`/${accountType}/dashboard`, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Workspace could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Link to="/" className="flex items-center gap-3 text-forest">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-ice"><Leaf className="h-5 w-5" aria-hidden="true" /></span>
          <span className="text-sm font-bold">GreenTrack<span className="mt-0.5 block text-[8px] tracking-[0.16em] text-slate-400">CARBON INTELLIGENCE</span></span>
        </Link>
        <span className="rounded-full bg-mint px-3 py-1.5 text-xs font-semibold text-leaf">{accountLabels[accountType]} account</span>
      </header>
      <main className="mx-auto max-w-3xl px-5 pb-12 pt-5 sm:px-8 sm:pt-10">
        <p className="mb-3 flex items-center gap-2 text-[10px] font-bold tracking-[0.18em] text-leaf"><ProfileIcon className="h-4 w-4" aria-hidden="true" /> WORKSPACE SETUP</p>
        <h1 className="text-3xl font-semibold tracking-[-0.05em] text-forest sm:text-5xl">
          Set up your {accountLabels[accountType].toLowerCase()} portal.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-500">
          Your data is isolated to authorized workspace members. Add the location and profile context you want attached to reports.
        </p>

        <form onSubmit={submit} className="surface-card mt-7 grid gap-5 p-5 sm:p-8">
          <label className="form-label">
            Workspace name
            <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} required className="form-input" placeholder="A name for this workspace" />
          </label>
          <label className="form-label">
            {profileLabel}
            <input value={profileName} onChange={(event) => setProfileName(event.target.value)} minLength={2} maxLength={160} required className="form-input" />
          </label>
          {accountType !== "individual" && (
            <label className="form-label">
              {detailLabel} <span className="font-normal text-slate-400">(optional)</span>
              <input value={profileDetail} onChange={(event) => setProfileDetail(event.target.value)} maxLength={160} className="form-input" placeholder={accountType === "college" ? "e.g. Main campus" : "e.g. Education"} />
            </label>
          )}
          <label className="form-label">
            Reporting region
            <input value={region} onChange={(event) => setRegion(event.target.value)} minLength={2} maxLength={120} required className="form-input" placeholder="Country, state, or reporting region" />
          </label>
          <p className="rounded-xl border border-ice bg-ice/60 p-3 text-xs leading-5 text-slate-600">
            GreenTrack does not preload emission factors. Add a factor only after verifying its source, region, year, and unit.
          </p>
          {error && <div role="alert"><ErrorState message={error} /></div>}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : "Finish setup"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
