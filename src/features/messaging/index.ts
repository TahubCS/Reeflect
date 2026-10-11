// What other features may use from messaging (AGENTS.md section 6).
export {
  type ClaimResult,
  type LinkState,
  type Platform,
  type VerifiedIdentity,
  claimLinkCode,
  findIdentity,
  getLinkState,
  revokeByHandle,
} from "./server/link";
