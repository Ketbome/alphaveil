export function Logo({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <pattern id="alphaveil-checker" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#2a2621" />
          <rect width="4" height="4" fill="#524b41" />
          <rect x="4" y="4" width="4" height="4" fill="#524b41" />
        </pattern>
        <clipPath id="alphaveil-disc"><circle cx="32" cy="32" r="20" /></clipPath>
      </defs>
      <rect width="64" height="64" rx="15" fill="#1d1a16" />
      <g clipPath="url(#alphaveil-disc)">
        <rect width="64" height="64" fill="url(#alphaveil-checker)" />
        <path d="M8 56 L56 8 L8 8 Z" fill="#df7a44" />
      </g>
      <circle cx="32" cy="32" r="20" fill="none" stroke="#df7a44" strokeWidth="3" />
      <path d="M13 51 L51 13" stroke="#1d1a16" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
