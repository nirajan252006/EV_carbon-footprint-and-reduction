import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AuthShell } from "../components/AuthShell";
import { ErrorState } from "../components/Feedback";
import { useWorkspace } from "../hooks/WorkspaceContext";
import type { AccountType } from "../types/api";

const accountLabels: Record<AccountType, string> = {
  individual: "Individual",
  college: "College",
  organization: "Organization",
};

function isAccountType(value: string | undefined): value is AccountType {
  return value === "individual" || value === "college" || value === "organization";
}

export function AuthPage({ mode }: { mode: "register" | "login" }) {
  const { accountType: routeType } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const { register, login, auth } = useWorkspace();
  const registering = mode === "register";
  const accountType = registering
    ? routeType
    : routeType ?? search.get("account_type") ?? undefined;
  const [name, setName] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [location, setLocation] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (registering && !isAccountType(accountType)) return <Navigate to="/" replace />;
  if (auth) {
    return <Navigate to={auth.onboarding_complete ? `/${auth.user.account_type}/dashboard` : "/onboarding"} replace />;
  }

  const typeLabel = isAccountType(accountType) ? accountLabels[accountType] : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (registering && isAccountType(accountType)) {
        await register({
          full_name: name.trim(),
          email: email.trim(),
          password,
          account_type: accountType,
          workspace_name: accountType === "college"
            ? institutionName.trim()
            : accountType === "organization"
              ? organizationName.trim()
              : undefined,
          location: location.trim() || undefined,
        });
        navigate("/onboarding", { replace: true });
      } else {
        await login({ email: email.trim(), password });
        navigate("/onboarding", { replace: true });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow={registering ? `${typeLabel?.toUpperCase()} ACCOUNT` : "SECURE SIGN IN"}
      title={registering ? `Create your ${typeLabel?.toLowerCase()} account.` : "Welcome back."}
      description={
        registering
          ? "Your password is securely hashed by the backend. The next step configures your private workspace."
          : typeLabel
            ? `Sign in to your GreenTrack account. You will be routed to its ${typeLabel.toLowerCase()} portal.`
            : "Sign in to continue to your private GreenTrack workspace."
      }
    >
      <form onSubmit={submit} className="surface-card mt-7 max-w-xl p-5 sm:p-8">
        <div className="mb-6 flex items-center gap-3 rounded-xl bg-mint/70 p-3 text-xs leading-5 text-slate-600">
          <LockKeyhole className="h-4 w-4 shrink-0 text-leaf" aria-hidden="true" />
          <span>Sessions use secure, HTTP-only cookies. Passwords never enter browser storage.</span>
        </div>
        {registering && (
          <>
            <label className="form-label mb-4">
              {accountType === "individual" ? "Full name" : "Authorized administrator name"}
              <input
                className="form-input"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={2}
                maxLength={120}
                required
              />
            </label>
            {accountType === "college" && (
              <label className="form-label mb-4">
                College name
                <input className="form-input" value={institutionName} onChange={(event) => setInstitutionName(event.target.value)} minLength={2} maxLength={160} required />
              </label>
            )}
            {accountType === "organization" && (
              <label className="form-label mb-4">
                Organization name
                <input className="form-input" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} minLength={2} maxLength={160} required />
              </label>
            )}
            {accountType !== "individual" && (
              <label className="form-label mb-4">
                Campus or location <span className="font-normal text-slate-400">(optional)</span>
                <input className="form-input" value={location} onChange={(event) => setLocation(event.target.value)} maxLength={120} />
              </label>
            )}
          </>
        )}
        <label className="form-label mb-4">
          Email
          <input
            className="form-input"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={254}
            required
          />
        </label>
        <label className="form-label">
          Password
          <input
            className="form-input"
            name="password"
            type="password"
            autoComplete={registering ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={registering ? 12 : 1}
            maxLength={128}
            required
          />
          {registering && <span className="font-normal text-slate-400">Use at least 12 characters.</span>}
        </label>
        {error && <div className="mt-4" role="alert"><ErrorState message={error} /></div>}
        <button type="submit" className="btn-primary mt-6 w-full justify-center" disabled={busy}>
          {busy ? "Please wait…" : registering ? "Create account" : "Sign in"}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <Link className="inline-flex items-center gap-1 hover:text-leaf" to="/">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Account options
          </Link>
          <Link
            className="font-medium text-leaf hover:underline"
            to={registering ? `/auth/${isAccountType(accountType) ? accountType : "individual"}` : `/register/${isAccountType(accountType) ? accountType : "individual"}`}
          >
            {registering ? "Already registered? Sign in" : "New to GreenTrack? Create an account"}
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
