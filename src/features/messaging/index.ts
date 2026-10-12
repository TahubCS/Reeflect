// What other features may use from messaging (AGENTS.md section 6).
export {
  type ClaimResult,
  type LinkState,
  type Platform,
  type VerifiedIdentity,
  cancelClaimByHandle,
  claimLinkCode,
  findIdentity,
  getLinkState,
  revokeByHandle,
} from "./server/link";
export {
  DEFAULT_QUIET_HOURS,
  type QuietHours,
  formatQuietHours,
  isQuiet,
  isValidQuietHours,
  nextAllowedSend,
} from "./domain/quiet-hours";
export {
  getQuietHours,
  quietHoursUndoableAt,
  setQuietHoursByText,
  undoQuietHours,
} from "./server/notifications";
