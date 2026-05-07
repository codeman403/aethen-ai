"use client";
import { AethenLogo } from "../../components/ui/logo";

// ── Ae Monogram — right leg of A IS the spine of E, core at junction ─────────
function LogoAeMonogram({ size = 80 }: { size?: number }) {
  const u = `aem${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <defs>
        <linearGradient id={`${u}-g`} x1="4" y1="6" x2="36" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#09090b" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#09090b" stopOpacity="1"    />
        </linearGradient>
        <radialGradient id={`${u}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#09090b" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#09090b" stopOpacity="0"    />
        </radialGradient>
      </defs>

      {/* ── A: left leg + right leg/E-spine + crossbar ── */}
      <line x1="4"  y1="34" x2="13" y2="6"  stroke={`url(#${u}-g)`} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="22" y1="34" x2="13" y2="6"  stroke={`url(#${u}-g)`} strokeWidth="2.2" strokeLinecap="round" />
      {/* A crossbar — aligns with E middle stroke */}
      <line x1="9"  y1="21" x2="19" y2="21" stroke="#09090b" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />

      {/* ── E: spine (shared with A right leg) + 3 strokes ── */}
      <line x1="22" y1="6"  x2="22" y2="34" stroke={`url(#${u}-g)`} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="22" y1="6"  x2="36" y2="6"  stroke="#09090b" strokeWidth="1.5" strokeLinecap="round" opacity="0.65" />
      {/* E middle stroke — same y as A crossbar, visual bridge */}
      <line x1="22" y1="21" x2="33" y2="21" stroke="#09090b" strokeWidth="1.5" strokeLinecap="round" opacity="0.55" />
      <line x1="22" y1="34" x2="36" y2="34" stroke="#09090b" strokeWidth="1.5" strokeLinecap="round" opacity="0.65" />

      {/* ── Nodes at key junctions ── */}
      <circle cx="13" cy="6"  r="2.4" fill="#09090b" opacity="0.9" />  {/* A apex */}
      <circle cx="4"  cy="34" r="1.8" fill="#09090b" opacity="0.45" /> {/* A left foot */}
      <circle cx="9"  cy="21" r="1.5" fill="#09090b" opacity="0.55" /> {/* crossbar L */}
      <circle cx="36" cy="6"  r="1.5" fill="#09090b" opacity="0.45" /> {/* E top end */}
      <circle cx="33" cy="21" r="1.5" fill="#09090b" opacity="0.45" /> {/* E mid end */}
      <circle cx="36" cy="34" r="1.5" fill="#09090b" opacity="0.45" /> {/* E bot end */}

      {/* ── Core — A-E junction, mid-height ── */}
      <circle cx="22" cy="21" r="7"   fill={`url(#${u}-glow)`} />
      <circle cx="22" cy="21" r="3"   fill="#09090b" opacity="0.9" />
      <circle cx="22" cy="21" r="1.2" fill="white"   opacity="0.85" />
    </svg>
  );
}

// ── Aethen Pulsar — diagnostic beams + pipeline nodes + module rings ─────────
function LogoAethenPulsar({ size = 80 }: { size?: number }) {
  const u = `ap${size}`;
  // Pipeline nodes along each jet: 3 per beam (outer→inner = dim→bright)
  // A — two legs + crossbar nodes
  const aNodes = [
    { cx: 15, cy: 10, r: 1.4, o: 0.5 }, // left foot of A
    { cx: 25, cy: 10, r: 1.4, o: 0.5 }, // right foot of A
    { cx: 17, cy: 15, r: 1.3, o: 0.6 }, // crossbar left
    { cx: 23, cy: 15, r: 1.3, o: 0.6 }, // crossbar right
  ];
  // E — spine + three stroke-end nodes
  const eNodes = [
    { cx: 17, cy: 22, r: 1.3, o: 0.55 }, // top stroke end
    { cx: 25, cy: 22, r: 1.2, o: 0.45 },
    { cx: 17, cy: 26, r: 1.3, o: 0.55 }, // mid stroke end
    { cx: 23, cy: 26, r: 1.1, o: 0.4  },
    { cx: 17, cy: 30, r: 1.3, o: 0.55 }, // bottom stroke end
    { cx: 25, cy: 30, r: 1.2, o: 0.45 },
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <defs>
        <clipPath id={`${u}-clip`}>
          <rect x="9" y="9" width="22" height="22" rx="2.5" transform="rotate(-5 20 20)" />
        </clipPath>
        <linearGradient id={`${u}-jt`} x1="20" y1="9" x2="20" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#09090b" stopOpacity="0"   />
          <stop offset="100%" stopColor="#09090b" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={`${u}-jb`} x1="20" y1="31" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#09090b" stopOpacity="0"   />
          <stop offset="100%" stopColor="#09090b" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id={`${u}-ct`} x1="20" y1="9"  x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#09090b" stopOpacity="0"    />
          <stop offset="100%" stopColor="#09090b" stopOpacity="0.07" />
        </linearGradient>
        <linearGradient id={`${u}-cb`} x1="20" y1="31" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#09090b" stopOpacity="0"    />
          <stop offset="100%" stopColor="#09090b" stopOpacity="0.06" />
        </linearGradient>
        <radialGradient id={`${u}-core`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#09090b" stopOpacity="1"   />
          <stop offset="100%" stopColor="#09090b" stopOpacity="0"   />
        </radialGradient>
        <radialGradient id={`${u}-halo`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#09090b" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#09090b" stopOpacity="0"   />
        </radialGradient>
        <filter id={`${u}-blur`}><feGaussianBlur stdDeviation="0.9"/></filter>
        <filter id={`${u}-sm`}  ><feGaussianBlur stdDeviation="0.5"/></filter>
      </defs>


      <g clipPath={`url(#${u}-clip)`}>
        {/* White fill */}
        <rect x="0" y="0" width="40" height="40" fill="#ffffff" />

        {/* Background causal graph — dim connected nodes */}
        <line x1="11" y1="13" x2="18" y2="17" stroke="#09090b" strokeWidth="0.5" opacity="0.2"  />
        <line x1="29" y1="13" x2="22" y2="17" stroke="#09090b" strokeWidth="0.5" opacity="0.15" />
        <line x1="11" y1="27" x2="18" y2="23" stroke="#09090b" strokeWidth="0.5" opacity="0.15" />
        <line x1="29" y1="27" x2="22" y2="23" stroke="#09090b" strokeWidth="0.5" opacity="0.2"  />
        <circle cx="11" cy="13" r="1" fill="#09090b" opacity="0.35" />
        <circle cx="29" cy="13" r="1" fill="#09090b" opacity="0.25" />
        <circle cx="11" cy="27" r="1" fill="#09090b" opacity="0.25" />
        <circle cx="29" cy="27" r="1" fill="#09090b" opacity="0.35" />


        {/* ── A (top half) ─────────────────────────────────────── */}
        {/* Left leg */}
        <line x1="20" y1="19" x2="15" y2="10" stroke={`url(#${u}-jt)`} strokeWidth="1.3" strokeLinecap="round" />
        {/* Right leg */}
        <line x1="20" y1="19" x2="25" y2="10" stroke={`url(#${u}-jt)`} strokeWidth="1.3" strokeLinecap="round" />
        {/* Crossbar */}
        <line x1="17" y1="15" x2="23" y2="15" stroke="#09090b" strokeWidth="1.1" strokeLinecap="round" opacity="0.6" />
        {/* Apex node */}
        <circle cx="20" cy="19" r="1.6" fill="#09090b" opacity="0.5" />
        {/* A nodes */}
        {aNodes.map((n, i) => (
          <g key={i}>
            <circle cx={n.cx} cy={n.cy} r={n.r + 1} fill="#09090b" opacity={0.05} filter={`url(#${u}-sm)`} />
            <circle cx={n.cx} cy={n.cy} r={n.r}      fill="#09090b" opacity={n.o} />
          </g>
        ))}

        {/* ── E (bottom half) ──────────────────────────────────── */}
        {/* Vertical spine */}
        <line x1="17" y1="21" x2="17" y2="30" stroke={`url(#${u}-jb)`} strokeWidth="1.3" strokeLinecap="round" />
        {/* Top stroke — full */}
        <line x1="17" y1="22" x2="25" y2="22" stroke="#09090b" strokeWidth="1.1" strokeLinecap="round" opacity="0.65" />
        {/* Middle stroke — shorter */}
        <line x1="17" y1="26" x2="23" y2="26" stroke="#09090b" strokeWidth="1.1" strokeLinecap="round" opacity="0.55" />
        {/* Bottom stroke — full */}
        <line x1="17" y1="30" x2="25" y2="30" stroke="#09090b" strokeWidth="1.1" strokeLinecap="round" opacity="0.65" />
        {/* E nodes */}
        {eNodes.map((n, i) => (
          <g key={i}>
            <circle cx={n.cx} cy={n.cy} r={n.r + 1} fill="#09090b" opacity={0.05} filter={`url(#${u}-sm)`} />
            <circle cx={n.cx} cy={n.cy} r={n.r}      fill="#09090b" opacity={n.o} />
          </g>
        ))}

        {/* Root cause core — emerald = confirmed */}
        <circle cx="20" cy="20" r="8"   fill={`url(#${u}-halo)`} />
        <circle cx="20" cy="20" r="3.5" fill={`url(#${u}-core)`} />
        <circle cx="20" cy="20" r="1.5" fill="#ffffff" />
      </g>

    </svg>
  );
}

// ── Concept 1: Black hole with accretion disk ───────────────────────────────
function LogoBlackHole({ size = 80 }: { size?: number }) {
  const u = `bh${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <defs>
        <clipPath id={`${u}-clip`}>
          <rect x="9" y="9" width="22" height="22" rx="2.5" transform="rotate(-5 20 20)" />
        </clipPath>
        <radialGradient id={`${u}-bg`} cx="42%" cy="46%" r="55%">
          <stop offset="0%"   stopColor="#0f0530" />
          <stop offset="60%"  stopColor="#04010f" />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>
        <linearGradient id={`${u}-disk`} x1="9" y1="20" x2="31" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#f97316" stopOpacity="0.1" />
          <stop offset="25%"  stopColor="#fbbf24" stopOpacity="1"   />
          <stop offset="50%"  stopColor="#fff7ed" stopOpacity="0.95"/>
          <stop offset="75%"  stopColor="#fb923c" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.1" />
        </linearGradient>
        <radialGradient id={`${u}-halo`} cx="50%" cy="50%" r="50%">
          <stop offset="55%"  stopColor="#7c3aed" stopOpacity="0"   />
          <stop offset="80%"  stopColor="#7c3aed" stopOpacity="0.25"/>
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0"   />
        </radialGradient>
        <filter id={`${u}-glow`}><feGaussianBlur stdDeviation="0.8" /></filter>
      </defs>

      {/* Outer frame */}
      <rect x="6" y="6" width="28" height="28" rx="3"
        stroke="#09090b" strokeWidth="1.2" fill="none" opacity="0.18"
        transform="rotate(20 20 20)" />

      <g clipPath={`url(#${u}-clip)`}>
        {/* Deep space bg */}
        <rect x="0" y="0" width="40" height="40" fill={`url(#${u}-bg)`} />
        {/* Stars */}
        {[[12,12,0.5,0.8],[27,11,0.4,0.6],[11,27,0.4,0.5],[28,28,0.5,0.7],[15,24,0.3,0.4],[24,14,0.3,0.5],[29,19,0.4,0.6],[13,17,0.3,0.4]].map(([x,y,r,o],i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="white" opacity={o} />
        ))}
        {/* Photon halo */}
        <circle cx="20" cy="20" r="9" fill={`url(#${u}-halo)`} />
        {/* Far disk (behind BH) */}
        <ellipse cx="20" cy="17.5" rx="8.5" ry="2.2"
          stroke={`url(#${u}-disk)`} strokeWidth="1" fill="none" opacity="0.45" />
        {/* Polar jet up */}
        <line x1="20" y1="14" x2="20" y2="9"
          stroke="#a78bfa" strokeWidth="0.7" opacity="0.4" filter={`url(#${u}-glow)`} />
        {/* Black hole shadow */}
        <circle cx="20" cy="20" r="5.8" fill="#000" />
        <circle cx="20" cy="20" r="5.2" fill="#07011a" />
        {/* Near disk (in front) */}
        <ellipse cx="20" cy="22.5" rx="8.5" ry="2.5"
          stroke={`url(#${u}-disk)`} strokeWidth="2.2" fill="none" />
        {/* Orange rim glow */}
        <ellipse cx="20" cy="22.5" rx="8.5" ry="2.5"
          stroke="#f97316" strokeWidth="4" fill="none" opacity="0.12"
          filter={`url(#${u}-glow)`} />
        {/* Polar jet down */}
        <line x1="20" y1="26" x2="20" y2="31"
          stroke="#a78bfa" strokeWidth="0.7" opacity="0.3" filter={`url(#${u}-glow)`} />
      </g>

      {/* Inner square border */}
      <rect x="9" y="9" width="22" height="22" rx="2.5"
        stroke="#3b1d8a" strokeWidth="1.6" fill="none"
        transform="rotate(-5 20 20)" opacity="0.9" />
    </svg>
  );
}

// ── Concept 2: Pulsar — twin jets + rings ───────────────────────────────────
function LogoPulsar({ size = 80 }: { size?: number }) {
  const u = `ps${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <defs>
        <clipPath id={`${u}-clip`}>
          <rect x="9" y="9" width="22" height="22" rx="2.5" transform="rotate(-5 20 20)" />
        </clipPath>
        <radialGradient id={`${u}-bg`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#001a2e" />
          <stop offset="100%" stopColor="#000509" />
        </radialGradient>
        <radialGradient id={`${u}-core`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="1"   />
          <stop offset="40%"  stopColor="#7dd3fc" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0"   />
        </radialGradient>
        <linearGradient id={`${u}-jet`} x1="20" y1="9" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#7dd3fc" stopOpacity="0" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={`${u}-jet2`} x1="20" y1="31" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#7dd3fc" stopOpacity="0" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.9" />
        </linearGradient>
        <filter id={`${u}-glow`}><feGaussianBlur stdDeviation="1.2" /></filter>
      </defs>

      <rect x="6" y="6" width="28" height="28" rx="3"
        stroke="#09090b" strokeWidth="1.2" fill="none" opacity="0.18"
        transform="rotate(20 20 20)" />

      <g clipPath={`url(#${u}-clip)`}>
        <rect x="0" y="0" width="40" height="40" fill={`url(#${u}-bg)`} />
        {[[13,13,0.4,0.6],[26,12,0.3,0.5],[12,26,0.3,0.4],[27,27,0.4,0.7],[29,16,0.3,0.5]].map(([x,y,r,o],i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="white" opacity={o} />
        ))}
        {/* Rotation rings */}
        <ellipse cx="20" cy="20" rx="9" ry="2.5"
          stroke="#0ea5e9" strokeWidth="0.8" fill="none" opacity="0.35" />
        <ellipse cx="20" cy="20" rx="7" ry="1.8"
          stroke="#38bdf8" strokeWidth="0.6" fill="none" opacity="0.25" />
        {/* Twin jets - cone shape */}
        <polygon points="20,20 17.5,9 22.5,9"
          fill={`url(#${u}-jet)`} opacity="0.7" />
        <polygon points="20,20 17.5,31 22.5,31"
          fill={`url(#${u}-jet2)`} opacity="0.7" />
        {/* Jet glow */}
        <line x1="20" y1="9" x2="20" y2="20"
          stroke="#7dd3fc" strokeWidth="3" opacity="0.2" filter={`url(#${u}-glow)`} />
        <line x1="20" y1="31" x2="20" y2="20"
          stroke="#7dd3fc" strokeWidth="3" opacity="0.2" filter={`url(#${u}-glow)`} />
        {/* Pulsar core */}
        <circle cx="20" cy="20" r="5" fill={`url(#${u}-core)`} />
        <circle cx="20" cy="20" r="5" fill="#7dd3fc" opacity="0.15"
          filter={`url(#${u}-glow)`} />
        <circle cx="20" cy="20" r="2" fill="white" />
      </g>

      <rect x="9" y="9" width="22" height="22" rx="2.5"
        stroke="#0369a1" strokeWidth="1.6" fill="none"
        transform="rotate(-5 20 20)" opacity="0.9" />
    </svg>
  );
}

// ── Concept 3: Nebula — colorful gas cloud ──────────────────────────────────
function LogoNebula({ size = 80 }: { size?: number }) {
  const u = `nb${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <defs>
        <clipPath id={`${u}-clip`}>
          <rect x="9" y="9" width="22" height="22" rx="2.5" transform="rotate(-5 20 20)" />
        </clipPath>
        <radialGradient id={`${u}-cloud1`} cx="38%" cy="42%" r="55%">
          <stop offset="0%"   stopColor="#7c3aed" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0"   />
        </radialGradient>
        <radialGradient id={`${u}-cloud2`} cx="65%" cy="60%" r="50%">
          <stop offset="0%"   stopColor="#06b6d4" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0"   />
        </radialGradient>
        <radialGradient id={`${u}-cloud3`} cx="50%" cy="30%" r="40%">
          <stop offset="0%"   stopColor="#ec4899" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ec4899" stopOpacity="0"   />
        </radialGradient>
        <radialGradient id={`${u}-star`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="1"   />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0"   />
        </radialGradient>
        <filter id={`${u}-blur`}><feGaussianBlur stdDeviation="2.5" /></filter>
        <filter id={`${u}-sm`}><feGaussianBlur stdDeviation="0.8" /></filter>
      </defs>

      <rect x="6" y="6" width="28" height="28" rx="3"
        stroke="#09090b" strokeWidth="1.2" fill="none" opacity="0.18"
        transform="rotate(20 20 20)" />

      <g clipPath={`url(#${u}-clip)`}>
        {/* Deep space base */}
        <rect x="0" y="0" width="40" height="40" fill="#02010a" />
        {/* Gas clouds - layered */}
        <rect x="0" y="0" width="40" height="40" fill={`url(#${u}-cloud1)`} filter={`url(#${u}-blur)`} />
        <rect x="0" y="0" width="40" height="40" fill={`url(#${u}-cloud2)`} filter={`url(#${u}-blur)`} />
        <rect x="0" y="0" width="40" height="40" fill={`url(#${u}-cloud3)`} filter={`url(#${u}-blur)`} />
        {/* Star field */}
        {[[12,13,0.5,1],[25,11,0.4,0.9],[11,25,0.4,0.8],[28,26,0.5,1],[17,28,0.3,0.7],[26,18,0.4,0.8],[13,20,0.3,0.6],[22,13,0.3,0.7]].map(([x,y,r,o],i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="white" opacity={o} />
        ))}
        {/* Bright stellar core */}
        <circle cx="20" cy="20" r="4" fill="white" opacity="0.9" filter={`url(#${u}-sm)`} />
        <circle cx="20" cy="20" r="2" fill="white" />
        <circle cx="20" cy="20" r="1" fill="#fef9c3" />
        {/* Cross diffraction spikes */}
        <line x1="20" y1="14" x2="20" y2="26" stroke="white" strokeWidth="0.4" opacity="0.4" />
        <line x1="14" y1="20" x2="26" y2="20" stroke="white" strokeWidth="0.4" opacity="0.4" />
      </g>

      <rect x="9" y="9" width="22" height="22" rx="2.5"
        stroke="#581c87" strokeWidth="1.6" fill="none"
        transform="rotate(-5 20 20)" opacity="0.9" />
    </svg>
  );
}

function LogoSpace({ size = 80 }: { size?: number }) {
  const uid = `sp-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <defs>
        {/* Deep space fill — dark void with faint purple core */}
        <radialGradient id={`${uid}-space`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#2e1065" stopOpacity="0.9" />
          <stop offset="45%"  stopColor="#0a0414" stopOpacity="0.97" />
          <stop offset="100%" stopColor="#000000" stopOpacity="1"    />
        </radialGradient>
        {/* Border glow — the event horizon light */}
        <filter id={`${uid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        {/* Centre singularity glow */}
        <radialGradient id={`${uid}-core`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#a78bfa" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0"   />
        </radialGradient>
      </defs>

      {/* Outer square — dim */}
      <rect x="6" y="6" width="28" height="28" rx="3"
        stroke="#09090b" strokeWidth="1.4" fill="none" opacity="0.2"
        transform="rotate(20 20 20)" />

      <g transform="rotate(-5 20 20)">
        {/* Space object fill */}
        <rect x="9" y="9" width="22" height="22" rx="2.5"
          fill={`url(#${uid}-space)`} />
        {/* Diagonal trace — subtle scan line */}
        <line x1="9" y1="9" x2="31" y2="31"
          stroke="white" strokeWidth="0.8" strokeOpacity="0.18"
          strokeLinecap="round" strokeDasharray="2.8 2" />
        {/* Border with glow */}
        <rect x="9" y="9" width="22" height="22" rx="2.5"
          stroke="#4c1d95" strokeWidth="1.8" fill="none"
          filter={`url(#${uid}-glow)`} opacity="0.8" />
        <rect x="9" y="9" width="22" height="22" rx="2.5"
          stroke="#7c3aed" strokeWidth="1" fill="none" opacity="0.5" />
        {/* Corner stars */}
        <circle cx="9"  cy="9"  r="1.5" fill="white" opacity="0.5" />
        <circle cx="31" cy="9"  r="1.5" fill="white" opacity="0.3" />
        <circle cx="9"  cy="31" r="1.5" fill="white" opacity="0.3" />
        <circle cx="31" cy="31" r="1.5" fill="white" opacity="0.3" />
      </g>

      {/* Singularity core */}
      <circle cx="20" cy="20" r="7"   fill={`url(#${uid}-core)`} />
      <circle cx="20" cy="20" r="3"   fill="#1e1b4b" />
      <circle cx="20" cy="20" r="1.5" fill="white"  fillOpacity="0.9" />
    </svg>
  );
}

function LogoCentre({ centerFill, centerOpacity = 1, size = 80 }: { centerFill: string; centerOpacity?: number; size?: number }) {
  const uid = `cp-${centerFill.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <defs>
        <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={centerFill} stopOpacity="0.35" />
          <stop offset="100%" stopColor={centerFill} stopOpacity="0"    />
        </radialGradient>
      </defs>
      <rect x="6" y="6" width="28" height="28" rx="3"
        stroke="#09090b" strokeWidth="1.4" fill="none" opacity="0.25"
        transform="rotate(20 20 20)" />
      <g transform="rotate(-5 20 20)">
        <line x1="9" y1="9" x2="31" y2="31"
          stroke="#09090b" strokeWidth="1.1" strokeOpacity="0.35"
          strokeLinecap="round" strokeDasharray="2.8 2" />
        <rect x="9" y="9" width="22" height="22" rx="2.5"
          stroke="#09090b" strokeWidth="2.2" fill="none" />
        <circle cx="9"  cy="9"  r="2" fill="#09090b" opacity="0.5" />
        <circle cx="31" cy="9"  r="2" fill="#09090b" opacity="0.5" />
        <circle cx="9"  cy="31" r="2" fill="#09090b" opacity="0.5" />
        <circle cx="31" cy="31" r="2" fill="#09090b" opacity="0.5" />
      </g>
      <circle cx="20" cy="20" r="6.5"  fill={`url(#${uid}-glow)`} />
      <circle cx="20" cy="20" r="3.2"  fill={centerFill} fillOpacity={centerOpacity} />
      <circle cx="20" cy="20" r="1.3"  fill="white" fillOpacity="0.8" />
    </svg>
  );
}

const LINE_OPTS = [
  { id: "1", label: "White",        stroke: "white",   opacity: 0.75, grad: false },
  { id: "2", label: "Emerald",      stroke: "#10B981", opacity: 1,    grad: false },
  { id: "3", label: "Purple",       stroke: "#7C3AED", opacity: 1,    grad: false },
  { id: "4", label: "Light purple", stroke: "#A78BFA", opacity: 1,    grad: false },
  { id: "5", label: "Sky blue",     stroke: "#38BDF8", opacity: 1,    grad: false },
  { id: "6", label: "Pur→Emerald",  stroke: "grad",    opacity: 1,    grad: true  },
];

const SQ_OPTS = [
  { id: "A", label: "Purple→Emerald", from: "#7C3AED", to: "#10B981" },
  { id: "B", label: "Blue→Emerald",   from: "#3B82F6", to: "#10B981" },
  { id: "C", label: "Indigo→Cyan",    from: "#6366F1", to: "#06B6D4" },
  { id: "D", label: "Purple→Blue",    from: "#7C3AED", to: "#3B82F6" },
  { id: "E", label: "White/Mono",     from: "#ffffff", to: "#ffffff" },
  { id: "F", label: "Purple→White",   from: "#7C3AED", to: "#ffffff" },
];

function Logo({ lineStroke, lineOpacity, lineGrad, sqFrom, sqTo, size = 80 }: {
  lineStroke: string; lineOpacity: number; lineGrad: boolean;
  sqFrom: string; sqTo: string; size?: number;
}) {
  const uid = `l-${lineStroke.replace(/[^a-z0-9]/gi,"")}-${sqFrom.replace("#","")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <defs>
        <linearGradient id={`${uid}-sq`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={sqFrom} />
          <stop offset="100%" stopColor={sqTo}   />
        </linearGradient>
        {lineGrad && (
          <linearGradient id={`${uid}-ln`} x1="9" y1="9" x2="31" y2="31" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
        )}
        <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#10B981" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#10B981" stopOpacity="0"   />
        </radialGradient>
      </defs>
      <rect x="6" y="6" width="28" height="28" rx="3"
        stroke={`url(#${uid}-sq)`} strokeWidth="1.4" fill="none" opacity="0.4"
        transform="rotate(20 20 20)" />
      <g transform="rotate(-5 20 20)">
        <line x1="9" y1="9" x2="31" y2="31"
          stroke={lineGrad ? `url(#${uid}-ln)` : lineStroke}
          strokeWidth="1.2" strokeOpacity={lineOpacity}
          strokeLinecap="round" strokeDasharray="2.8 2" />
        <rect x="9" y="9" width="22" height="22" rx="2.5"
          stroke={`url(#${uid}-sq)`} strokeWidth="2.2" fill="none" />
        <circle cx="9"  cy="9"  r="2"   fill="#7C3AED" />
        <circle cx="31" cy="9"  r="2"   fill="#7C3AED" opacity="0.7" />
        <circle cx="9"  cy="31" r="2"   fill="#7C3AED" opacity="0.7" />
        <circle cx="31" cy="31" r="2.4" fill="#10B981" />
      </g>
      <circle cx="20" cy="20" r="6.5" fill={`url(#${uid}-glow)`} />
      <circle cx="20" cy="20" r="3.2" fill="#10B981" />
      <circle cx="20" cy="20" r="1.3" fill="white"   fillOpacity="0.8" />
    </svg>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-4xl">
      <h2 className="text-sm font-mono font-bold text-black/50 uppercase tracking-widest mb-6">{title}</h2>
      <div className="flex flex-wrap gap-8 mb-8">{children}</div>
      <div className="flex flex-wrap gap-8 bg-[#0A0A0F] rounded-2xl p-8">{children}</div>
    </div>
  );
}

export default function LogoPreview() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center gap-14 p-12">
      <h1 className="text-xl font-bold text-black/70 tracking-tight">Aethen AI — Logo Colour Options</h1>

      {/* Current logo */}
      <div className="w-full max-w-4xl">
        <h2 className="text-sm font-mono font-bold text-black/50 uppercase tracking-widest mb-6">Current logo — black squares · purple→emerald trace</h2>
        <div className="flex gap-10 items-end mb-6">
          {[120, 80, 48, 32, 20].map(s => (
            <div key={s} className="flex flex-col items-center gap-2">
              <AethenLogo size={s} />
              <span className="text-[11px] font-bold text-black/50">{s}px</span>
            </div>
          ))}
        </div>
        <div className="flex gap-10 items-end bg-[#0A0A0F] rounded-2xl p-8">
          {[120, 80, 48, 32, 20].map(s => (
            <div key={s} className="flex flex-col items-center gap-2">
              <AethenLogo size={s} />
              <span className="text-[11px] font-bold text-white/40">{s}px</span>
            </div>
          ))}
        </div>
      </div>

      {/* Ae Monogram */}
      <div className="w-full max-w-4xl">
        <h2 className="text-sm font-mono font-bold text-black/50 uppercase tracking-widest mb-6">Ae Monogram — shared stroke, core at junction</h2>
        <div className="flex gap-10 items-end mb-6">
          {[120, 80, 48, 32].map(s => (
            <div key={s} className="flex flex-col items-center gap-2">
              <LogoAeMonogram size={s} />
              <span className="text-[11px] font-bold text-black/50">{s}px</span>
            </div>
          ))}
        </div>
        <div className="flex gap-10 items-end bg-[#0A0A0F] rounded-2xl p-8">
          {[120, 80, 48, 32].map(s => (
            <div key={s} className="flex flex-col items-center gap-2">
              <LogoAeMonogram size={s} />
              <span className="text-[11px] font-bold text-white/40">{s}px</span>
            </div>
          ))}
        </div>
      </div>

      {/* Aethen Pulsar */}
      <div className="w-full max-w-4xl">
        <h2 className="text-sm font-mono font-bold text-black/50 uppercase tracking-widest mb-6">Aethen Pulsar — diagnostic beams + pipeline nodes + module rings</h2>
        <div className="flex gap-12 items-end mb-6">
          {[100, 64, 32].map(s => (
            <div key={s} className="flex flex-col items-center gap-2">
              <LogoAethenPulsar size={s} />
              <span className="text-[11px] font-bold text-black/50">{s}px</span>
            </div>
          ))}
        </div>
        <div className="flex gap-12 items-end bg-[#0A0A0F] rounded-2xl p-8">
          {[100, 64, 32].map(s => (
            <div key={s} className="flex flex-col items-center gap-2">
              <LogoAethenPulsar size={s} />
              <span className="text-[11px] font-bold text-white/40">{s}px</span>
            </div>
          ))}
        </div>
      </div>

      {/* Space concepts */}
      <div className="w-full max-w-4xl">
        <h2 className="text-sm font-mono font-bold text-black/50 uppercase tracking-widest mb-6">Space object concepts</h2>
        <div className="flex gap-12 mb-6">
          {[
            { label: "1 · Black Hole", C: LogoBlackHole },
            { label: "2 · Pulsar",     C: LogoPulsar    },
            { label: "3 · Nebula",     C: LogoNebula    },
          ].map(({ label, C }) => (
            <div key={label} className="flex flex-col items-center gap-3">
              <C size={100} />
              <span className="text-[11px] font-bold text-black/60">{label}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-12 bg-[#0A0A0F] rounded-2xl p-8">
          {[
            { label: "1 · Black Hole", C: LogoBlackHole },
            { label: "2 · Pulsar",     C: LogoPulsar    },
            { label: "3 · Nebula",     C: LogoNebula    },
          ].map(({ label, C }) => (
            <div key={label} className="flex flex-col items-center gap-3">
              <C size={100} />
              <span className="text-[11px] font-bold text-white/40">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Centre node colour options */}
      <div className="w-full max-w-4xl">
        <h2 className="text-sm font-mono font-bold text-black/50 uppercase tracking-widest mb-6">Centre node — colour options</h2>
        <div className="flex gap-10 mb-6">
          {[
            { label: "Current (green)", fill: "#10B981" },
            { label: "Grey",            fill: "#09090b", opacity: 0.4 },
            { label: "Black",           fill: "#09090b" },
          ].map(o => (
            <div key={o.label} className="flex flex-col items-center gap-2">
              <LogoCentre centerFill={o.fill} centerOpacity={o.opacity ?? 1} size={80} />
              <span className="text-[11px] font-bold text-black/60">{o.label}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-10 bg-[#0A0A0F] rounded-2xl p-8">
          {[
            { label: "Current (green)", fill: "#10B981" },
            { label: "Grey",            fill: "#09090b", opacity: 0.4 },
            { label: "Black",           fill: "#09090b" },
          ].map(o => (
            <div key={o.label} className="flex flex-col items-center gap-2">
              <LogoCentre centerFill={o.fill} centerOpacity={o.opacity ?? 1} size={80} />
              <span className="text-[11px] font-bold text-white/40">{o.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Current logo — black / landing page match */}
      <div className="w-full max-w-4xl">
        <h2 className="text-sm font-mono font-bold text-black/50 uppercase tracking-widest mb-6">Current — Black (landing page match)</h2>
        <div className="flex gap-10">
          <div className="flex flex-col items-center gap-2">
            <AethenLogo size={80} />
            <span className="text-[11px] font-bold text-black/60">On light</span>
          </div>
          <div className="bg-[#0A0A0F] rounded-2xl p-6 flex flex-col items-center gap-2">
            <AethenLogo size={80} />
            <span className="text-[11px] font-bold text-white/40">On dark</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <AethenLogo size={32} />
            <span className="text-[11px] font-bold text-black/60">32px</span>
          </div>
          <div className="bg-[#0A0A0F] rounded-2xl p-4 flex flex-col items-center gap-2">
            <AethenLogo size={32} />
            <span className="text-[11px] font-bold text-white/40">32px dark</span>
          </div>
        </div>
      </div>

      {/* Line colour options */}
      <div className="w-full max-w-4xl">
        <h2 className="text-sm font-mono font-bold text-black/50 uppercase tracking-widest mb-6">Diagonal line colour</h2>
        <div className="flex flex-wrap gap-8 mb-8">
          {LINE_OPTS.map(o => (
            <div key={o.id} className="flex flex-col items-center gap-2">
              <Logo lineStroke={o.stroke} lineOpacity={o.opacity} lineGrad={o.grad} sqFrom="#7C3AED" sqTo="#10B981" size={72} />
              <span className="text-[11px] font-bold text-black/60">{o.id} · {o.label}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-8 bg-[#0A0A0F] rounded-2xl p-8">
          {LINE_OPTS.map(o => (
            <div key={o.id} className="flex flex-col items-center gap-2">
              <Logo lineStroke={o.stroke} lineOpacity={o.opacity} lineGrad={o.grad} sqFrom="#7C3AED" sqTo="#10B981" size={72} />
              <span className="text-[11px] font-bold text-white/40">{o.id} · {o.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Square colour options */}
      <div className="w-full max-w-4xl">
        <h2 className="text-sm font-mono font-bold text-black/50 uppercase tracking-widest mb-6">Square stroke colour</h2>
        <div className="flex flex-wrap gap-8 mb-8">
          {SQ_OPTS.map(o => (
            <div key={o.id} className="flex flex-col items-center gap-2">
              <Logo lineStroke="white" lineOpacity={0.75} lineGrad={false} sqFrom={o.from} sqTo={o.to} size={72} />
              <span className="text-[11px] font-bold text-black/60">{o.id} · {o.label}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-8 bg-[#0A0A0F] rounded-2xl p-8">
          {SQ_OPTS.map(o => (
            <div key={o.id} className="flex flex-col items-center gap-2">
              <Logo lineStroke="white" lineOpacity={0.75} lineGrad={false} sqFrom={o.from} sqTo={o.to} size={72} />
              <span className="text-[11px] font-bold text-white/40">{o.id} · {o.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
