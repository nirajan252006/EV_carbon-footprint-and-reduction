import { memo } from "react";

// Pre-calculated deterministic floating particles to prevent hydration differences
const PARTICLES = [
  { id: 1, left: "12%", top: "85%", size: 6, color: "rgba(66, 230, 149, 0.4)", duration: "18s", delay: "0s" },
  { id: 2, left: "28%", top: "92%", size: 4, color: "rgba(66, 201, 255, 0.35)", duration: "24s", delay: "3s" },
  { id: 3, left: "45%", top: "80%", size: 8, color: "rgba(32, 214, 199, 0.3)", duration: "22s", delay: "6s" },
  { id: 4, left: "62%", top: "88%", size: 5, color: "rgba(155, 123, 255, 0.35)", duration: "20s", delay: "2s" },
  { id: 5, left: "78%", top: "82%", size: 7, color: "rgba(66, 230, 149, 0.45)", duration: "26s", delay: "7s" },
  { id: 6, left: "88%", top: "90%", size: 4, color: "rgba(79, 140, 255, 0.35)", duration: "19s", delay: "4s" },
  { id: 7, left: "20%", top: "60%", size: 5, color: "rgba(66, 230, 149, 0.3)", duration: "25s", delay: "5s" },
  { id: 8, left: "38%", top: "70%", size: 6, color: "rgba(66, 201, 255, 0.4)", duration: "21s", delay: "8s" },
  { id: 9, left: "55%", top: "65%", size: 4, color: "rgba(32, 214, 199, 0.35)", duration: "27s", delay: "1s" },
  { id: 10, left: "70%", top: "72%", size: 6, color: "rgba(155, 123, 255, 0.3)", duration: "23s", delay: "9s" },
  { id: 11, left: "84%", top: "58%", size: 5, color: "rgba(66, 230, 149, 0.35)", duration: "17s", delay: "11s" },
  { id: 12, left: "94%", top: "68%", size: 4, color: "rgba(66, 201, 255, 0.3)", duration: "22s", delay: "10s" },
];

export const AmbientBackground = memo(function AmbientBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
    >
      {/* Layer 1 — Atmospheric shifting multi-color gradient */}
      <div className="atmospheric-gradient" />

      {/* Layer 2 — Floating environmental particles with gentle glow */}
      <div className="absolute inset-0">
        {PARTICLES.map((p) => (
          <div
            key={p.id}
            className="floating-particle shadow-sm"
            style={{
              left: p.left,
              top: p.top,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
              animationDuration: p.duration,
              animationDelay: p.delay,
            }}
          />
        ))}
      </div>

      {/* Layer 3 — Ambient blurred drifting orbs */}
      <div className="ambient-orb ambient-orb-green" />
      <div className="ambient-orb ambient-orb-cyan" />
      <div className="ambient-orb ambient-orb-violet" />

      {/* Layer 4 — Futuristic precision grid */}
      <div className="ambient-grid" />

      {/* Layer 5 — Environmental motion: circular carbon energy rings */}
      <div className="absolute -right-24 -top-24 h-[420px] w-[420px] opacity-20 dark:opacity-25 transition-opacity">
        <svg
          viewBox="0 0 400 400"
          className="h-full w-full animate-spin-slow duration-[90s]"
          fill="none"
          stroke="currentColor"
        >
          <circle
            cx="200"
            cy="200"
            r="180"
            className="stroke-emerald-400/40 dark:stroke-ecogreen/40"
            strokeWidth="1.5"
            strokeDasharray="8 12"
          />
          <circle
            cx="200"
            cy="200"
            r="140"
            className="stroke-cyan-400/30 dark:stroke-ecocyan/30"
            strokeWidth="1"
            strokeDasharray="4 8"
          />
          <circle
            cx="200"
            cy="200"
            r="100"
            className="stroke-violet-400/30 dark:stroke-ecoviolet/30"
            strokeWidth="1.5"
            strokeDasharray="12 16"
          />
        </svg>
      </div>

      {/* Wave stream accent in bottom left */}
      <div className="absolute -bottom-20 -left-20 h-80 w-80 opacity-15 dark:opacity-20 transition-opacity">
        <svg viewBox="0 0 300 300" className="h-full w-full" fill="none">
          <circle
            cx="150"
            cy="150"
            r="130"
            className="stroke-teal-400/40 dark:stroke-ecoteal/40"
            strokeWidth="1.5"
            strokeDasharray="14 10"
          />
          <circle
            cx="150"
            cy="150"
            r="80"
            className="stroke-emerald-400/30 dark:stroke-ecogreen/30"
            strokeWidth="1"
          />
        </svg>
      </div>
    </div>
  );
});
