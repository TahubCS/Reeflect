// Pages that Better Auth sends people back to from an email link (ADR-052).
// Relative paths: Better Auth resolves them against BETTER_AUTH_URL.

/** Where a verification link lands; `?error=…` when the link is bad. */
export const EMAIL_VERIFIED_PATH = "/email-verified";

/** Where a reset link lands; `?token=…`, or `?error=…` when it is bad. */
export const RESET_PASSWORD_PATH = "/reset-password";

/** Where a signed-in person lands. */
export const AFTER_AUTH_PATH = "/dashboard";
