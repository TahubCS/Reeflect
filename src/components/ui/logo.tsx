/**
 * The two-wave mark from the landing page (and the app icon,
 * src/app/icon.svg). It takes its colour from the text around it.
 */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="26" height="26" rx="8" strokeWidth="1.6" />
      <path
        d="M7 11.5c2.3-2 4.7-2 7 0s4.7 2 7 0"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M7 17c2.3 2 4.7 2 7 0s4.7-2 7 0"
        strokeOpacity="0.45"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
