import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { ac, roles } from "./permissions";

// Browser client for sign-in, sign-up, sign-out and workspaces. It talks to
// /api/auth on the same origin.
export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles })],
});
