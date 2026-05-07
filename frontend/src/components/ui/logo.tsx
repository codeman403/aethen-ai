"use client";

export function AethenLogo({ size = 32, className = "" }: { size?: number; className?: string }) {
  const uid = `al-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id={`${uid}-g`} x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
      </defs>

      {/* Outer square — rotated 20° */}
      <rect
        x="6" y="6" width="28" height="28" rx="3"
        stroke={`url(#${uid}-g)`} strokeWidth="1.4" fill="none" opacity="0.35"
        transform="rotate(20 20 20)"
      />

      {/* Inner group — rotated −5° */}
      <g transform="rotate(-5 20 20)">
        {/* Diagonal causal trace */}
        <line
          x1="9" y1="9" x2="31" y2="31"
          stroke={`url(#${uid}-g)`} strokeWidth="1.2"
          strokeLinecap="round" strokeDasharray="2.8 2"
        />
        {/* Inner square */}
        <rect
          x="9" y="9" width="22" height="22" rx="2.5"
          stroke={`url(#${uid}-g)`} strokeWidth="2.2" fill="none"
        />
        {/* Corner nodes */}
        <circle cx="9"  cy="9"  r="2" fill="#7C3AED" opacity="0.7" />
        <circle cx="31" cy="9"  r="2" fill="#5B21B6" opacity="0.6" />
        <circle cx="9"  cy="31" r="2" fill="#059669" opacity="0.6" />
        <circle cx="31" cy="31" r="2" fill="#10B981" opacity="0.7" />
      </g>

      {/* Centre node */}
      <circle cx="20" cy="20" r="3.2" fill={`url(#${uid}-g)`} opacity="0.9" />
      <circle cx="20" cy="20" r="1.3" fill="white" fillOpacity="0.85" />
    </svg>
  );
}
