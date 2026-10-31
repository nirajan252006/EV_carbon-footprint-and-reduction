import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Building2, School, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { AuthShell } from "../components/AuthShell";
import type { AccountType } from "../types/api";

const accounts: Array<{
  type: AccountType;
  name: string;
  description: string;
  icon: typeof UserRound;
  features: string[];
}> = [
  {
    type: "individual",
    name: "Individual",
    description: "Track personal activities and build a clearer picture of your footprint.",
    icon: UserRound,
    features: ["Personal activity log", "Monthly trends", "Actionable recommendations"],
  },
  {
    type: "college",
    name: "College",
    description: "Organize campus or department reporting in a dedicated workspace.",
    icon: School,
    features: ["Campus reporting", "Department context", "Source-backed factors"],
  },
  {
    type: "organization",
    name: "Organization",
    description: "Maintain a focused emissions record for your organization.",
    icon: Building2,
    features: ["Operational activity", "Reporting exports", "Team-ready workspace"],
  },
];

export function AccountSelectionPage() {
  const reduceMotion = useReducedMotion();
  return (
    <AuthShell
      eyebrow="WELCOME TO GREENTRACK"
      title="Choose your account"
      description="Start with the workspace that fits your reporting needs. Each account gets a private data space and a tailored dashboard."
    >
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {accounts.map(({ type, name, description, icon: Icon, features }, index) => (
          <motion.section
            key={type}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={reduceMotion ? undefined : { y: -4, scale: 1.01 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, delay: reduceMotion ? 0 : index * 0.05, ease: "easeOut" }}
            className="surface-card flex min-h-full flex-col p-5 sm:p-6"
            aria-labelledby={`account-${type}`}
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-mint text-leaf">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 id={`account-${type}`} className="mt-5 text-lg font-semibold text-forest">{name}</h2>
            <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{description}</p>
            <ul className="mt-4 grid gap-2 text-xs text-slate-600">
              {features.map((feature) => <li key={feature} className="flex gap-2"><span aria-hidden="true" className="text-leaf">✓</span>{feature}</li>)}
            </ul>
            <div className="mt-6 grid gap-2">
              <Link className="btn-primary justify-center" to={`/register/${type}`}>
                Create {name.toLowerCase()} account <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                className="inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-forest"
                to={`/auth/${type}`}
              >
                Sign in
              </Link>
            </div>
          </motion.section>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-slate-400">
        Your account type is fixed at registration; workspaces are isolated by the server.
      </p>
    </AuthShell>
  );
}
