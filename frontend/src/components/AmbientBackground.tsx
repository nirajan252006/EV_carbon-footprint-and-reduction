import { memo } from "react";

interface AmbientBackgroundProps {
  accountType?: "individual" | "organization" | "college";
}

// Pre-calculated deterministic floating particles in Electric Cyan, Holographic Blue, Neon Violet, Magenta
const PARTICLES = [
  { id: 1, left: "10%", top: "85%", size: 6, color: "rgba(0, 229, 255, 0.45)", duration: "18s", delay: "0s" },
  { id: 2, left: "26%", top: "92%", size: 4, color: "rgba(168, 85, 247, 0.4)", duration: "24s", delay: "3s" },
  { id: 3, left: "42%", top: "80%", size: 8, color: "rgba(57, 123, 255, 0.35)", duration: "22s", delay: "6s" },
  { id: 4, left: "60%", top: "88%", size: 5, color: "rgba(244, 114, 208, 0.4)", duration: "20s", delay: "2s" },
  { id: 5, left: "76%", top: "82%", size: 7, color: "rgba(0, 229, 255, 0.5)", duration: "26s", delay: "7s" },
  { id: 6, left: "88%", top: "90%", size: 4, color: "rgba(168, 85, 247, 0.45)", duration: "19s", delay: "4s" },
  { id: 7, left: "18%", top: "60%", size: 5, color: "rgba(57, 123, 255, 0.35)", duration: "25s", delay: "5s" },
  { id: 8, left: "36%", top: "70%", size: 6, color: "rgba(0, 229, 255, 0.4)", duration: "21s", delay: "8s" },
  { id: 9, left: "54%", top: "65%", size: 4, color: "rgba(244, 114, 208, 0.4)", duration: "27s", delay: "1s" },
  { id: 10, left: "72%", top: "72%", size: 6, color: "rgba(168, 85, 247, 0.35)", duration: "23s", delay: "9s" },
  { id: 11, left: "86%", top: "58%", size: 5, color: "rgba(0, 229, 255, 0.4)", duration: "17s", delay: "11s" },
  { id: 12, left: "95%", top: "68%", size: 4, color: "rgba(57, 123, 255, 0.35)", duration: "22s", delay: "10s" },
];

export const AmbientBackground = memo(function AmbientBackground({
  accountType = "individual",
}: AmbientBackgroundProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
    >
      {/* Layer 1 — Shifting Aurora Atmospheric Gradient (No Green: Cyan, Blue, Violet, Magenta) */}
      <div className="atmospheric-gradient" />

      {/* Layer 2 — Floating Climate Intelligence Particles */}
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
              boxShadow: `0 0 ${p.size * 2.5}px ${p.color}`,
              animationDuration: p.duration,
              animationDelay: p.delay,
            }}
          />
        ))}
      </div>

      {/* Layer 3 — Drifting Ambient Glow Orbs */}
      <div className="ambient-orb ambient-orb-cyan" />
      <div className="ambient-orb ambient-orb-violet" />
      <div className="ambient-orb ambient-orb-blue" />

      {/* Layer 4 — Futuristic Precision Holographic Grid */}
      <div className="ambient-grid" />

      {/* Layer 5 — Dedicated Experience Motion Identity */}
      {accountType === "individual" && (
        /* Individual: Floating personal energy rings & soft wave arcs */
        <>
          <div className="absolute -right-20 -top-20 h-[400px] w-[400px] opacity-25">
            <svg
              viewBox="0 0 400 400"
              className="h-full w-full animate-spin-slow duration-[100s]"
              fill="none"
              stroke="currentColor"
            >
              <circle cx="200" cy="200" r="180" className="stroke-cyan-400/40" strokeWidth="1.5" strokeDasharray="8 12" />
              <circle cx="200" cy="200" r="130" className="stroke-violet-500/35" strokeWidth="1" strokeDasharray="6 8" />
              <circle cx="200" cy="200" r="85" className="stroke-hologram-blue/40" strokeWidth="1.5" strokeDasharray="10 14" />
            </svg>
          </div>
          <div className="absolute -bottom-16 -left-16 h-72 w-72 opacity-20">
            <svg viewBox="0 0 300 300" className="h-full w-full" fill="none">
              <circle cx="150" cy="150" r="120" className="stroke-cyan-400/35" strokeWidth="1.5" strokeDasharray="12 10" />
              <circle cx="150" cy="150" r="75" className="stroke-hologram-magenta/30" strokeWidth="1" />
            </svg>
          </div>
        </>
      )}

      {accountType === "organization" && (
        /* Organization: Industrial nodes & facility interconnected transit mesh */
        <div className="absolute inset-0 opacity-20">
          <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="orgLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.4" />
                <stop offset="50%" stopColor="#A855F7" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#397BFF" stopOpacity="0.4" />
              </linearGradient>
            </defs>
            <path
              d="M 100 200 L 300 350 L 600 250 L 950 400 L 1300 280 L 1600 450"
              fill="none"
              stroke="url(#orgLineGrad)"
              strokeWidth="1.5"
              strokeDasharray="6 8"
            />
            <path
              d="M 250 150 L 550 100 L 850 200 L 1200 120 L 1500 220"
              fill="none"
              stroke="url(#orgLineGrad)"
              strokeWidth="1"
              strokeDasharray="4 6"
            />
            {/* Facility Hub Pulsing Nodes */}
            <circle cx="300" cy="350" r="4" fill="#00E5FF" />
            <circle cx="600" cy="250" r="5" fill="#A855F7" />
            <circle cx="950" cy="400" r="4" fill="#397BFF" />
            <circle cx="1300" cy="280" r="5" fill="#00E5FF" />
          </svg>
        </div>
      )}

      {accountType === "college" && (
        /* College / Campus: Campus building constellation network & transit routes */
        <div className="absolute inset-0 opacity-25">
          <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="campusLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#F472D0" stopOpacity="0.4" />
              </linearGradient>
            </defs>
            {/* Campus Constellation Polygon connecting Academic, Hostel, Lab, Canteen */}
            <polygon
              points="200,220 480,140 780,260 620,480 320,440"
              fill="none"
              stroke="url(#campusLineGrad)"
              strokeWidth="1.5"
              strokeDasharray="8 8"
            />
            <line x1="200" y1="220" x2="780" y2="260" stroke="#397BFF" strokeWidth="1" strokeDasharray="3 5" />
            <line x1="480" y1="140" x2="320" y2="440" stroke="#A855F7" strokeWidth="1" strokeDasharray="3 5" />
            {/* Campus Building Nodes */}
            <circle cx="200" cy="220" r="6" fill="#00E5FF" className="animate-pulse" />
            <circle cx="480" cy="140" r="5" fill="#A855F7" />
            <circle cx="780" cy="260" r="6" fill="#F472D0" />
            <circle cx="620" cy="480" r="5" fill="#397BFF" />
            <circle cx="320" cy="440" r="5" fill="#00E5FF" />
          </svg>
        </div>
      )}
    </div>
  );
});
