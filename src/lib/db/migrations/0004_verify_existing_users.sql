-- ADR-052: users who signed up before email verification was required are
-- treated as verified, so turning verification on does not lock them out.
-- Runs once per database; users created afterwards must verify by email.
UPDATE "user" SET "email_verified" = true WHERE "email_verified" = false;
