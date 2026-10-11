// Neon services for this project's branches (ADR-053). Apply with
// `neon deploy` after `neon link`; it provisions the private `statements`
// bucket and pulls the branch's AWS_* storage variables into .env.local.
// Set STATEMENTS_BUCKET=statements yourself, and the same five variables on
// Vercel. The app never reads this file.
import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  buckets: {
    statements: {},
  },
});
