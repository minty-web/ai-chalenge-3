/**
 * ChatterSnap mark — an orange speech bubble with three white dots and a plum
 * lightning bolt slicing its right edge.
 *
 * Drawn inline rather than shipped as a bitmap so it stays crisp at every size and
 * keeps its contrast in both themes (the source artwork has a cream background,
 * which would sit as a bright block on the dark page).
 */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      role="img"
      aria-label="ChatterSnap"
      className={className}
    >
      {/* Bubble body with its tail, bottom-left. */}
      <path
        d="M4 15.5C4 8.6 9.6 3 16.5 3h15C38.4 3 44 8.6 44 15.5S38.4 28 31.5 28H16l-9.4 6.6A1.3 1.3 0 0 1 4.6 33.5z"
        fill="var(--ln-brand-1)"
      />
      <circle cx="15" cy="15.6" r="3" fill="#fff" />
      <circle cx="23" cy="15.6" r="3" fill="#fff" />
      <circle cx="31" cy="15.6" r="3" fill="#fff" />
      {/* Bolt, cutting across the bubble's right side. */}
      <path
        d="M31.6 1h9.9L35.4 17.3h8.1L26.6 47l3.9-18.7h-9.7z"
        fill="var(--ln-brand-2)"
        stroke="var(--ln-panel)"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mark plus wordmark, sized for the header. */
export function Wordmark({ height = 34 }: { height?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5" style={{ height }}>
      <Logo size={height} />
      <span
        className="ln-display leading-none"
        style={{ fontSize: height * 0.56, fontWeight: 700, letterSpacing: '-0.01em' }}
      >
        <span style={{ color: 'var(--ln-brand-1)' }}>Chatter</span>
        <span style={{ color: 'var(--ln-brand-2)' }}>Snap</span>
      </span>
    </span>
  );
}
