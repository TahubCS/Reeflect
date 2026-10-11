// A messaging handle is a phone number or, on iMessage, an email address.
// It identifies a person, so it is stored normalized and shown masked.

const PHONE_LIKE = /^\+?[\d\s().-]+$/;
const MIN_PHONE_DIGITS = 7;

function phoneDigits(handle: string): string | null {
  if (!PHONE_LIKE.test(handle)) return null;
  const digits = handle.replace(/\D/g, "");
  return digits.length >= MIN_PHONE_DIGITS ? digits : null;
}

/**
 * One spelling per handle, so "+1 (555) 123-4567" and "+15551234567" are the
 * same phone and "Sam@iCloud.com" and "sam@icloud.com" the same address.
 */
export function normalizeHandle(raw: string): string {
  const handle = raw.trim().toLowerCase();
  const digits = phoneDigits(handle);
  if (digits === null) return handle;
  return handle.startsWith("+") ? `+${digits}` : digits;
}

/** What the website shows for a handle: enough to recognize, not to copy. */
export function maskHandle(handle: string): string {
  const digits = phoneDigits(handle);
  if (digits !== null) return `phone ending ${digits.slice(-4)}`;

  const at = handle.lastIndexOf("@");
  if (at > 0) return `${handle[0]}***${handle.slice(at)}`;
  return `${handle.slice(0, 1)}***`;
}
