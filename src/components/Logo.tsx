/**
 * ChatterSnap brand mark — speech bubble + bolt, orange on deep plum.
 * Drawn inline so it scales cleanly and follows the theme.
 */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="ChatterSnap"
      className={className}
    >
      <rect width="48" height="48" rx="11" fill="var(--ln-brand-1)" />
      <circle cx="15.5" cy="20.2" r="2.7" fill="#FFFFFF" />
      <circle cx="23" cy="20.2" r="2.7" fill="#FFFFFF" />
      <circle cx="30.5" cy="20.2" r="2.7" fill="#FFFFFF" />
      <path fill="var(--ln-brand-2)" d="M28.6 4.2h8.7l-4.9 15.1h7.2L25 43.8l3.4-16.6h-8.6z" />
    </svg>
  );
}
