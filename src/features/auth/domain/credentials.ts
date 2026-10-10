import { z } from "zod";

// Form input is validated here before it reaches Better Auth (ADR-006). The
// password limits match Better Auth's defaults.

const email = z.email("Enter an email address like name@example.com.");

const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

const signUpSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(80, "Use 80 characters or fewer."),
  email,
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(128, "Use 128 characters or fewer."),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

/** One message per form field that is wrong. */
export type FieldErrors = Partial<Record<keyof SignUpInput, string>>;

export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: FieldErrors };

function parse<T>(schema: z.ZodType<T>, raw: unknown): Parsed<T> {
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (field === "name" || field === "email" || field === "password") {
      // Keep the first message for each field.
      errors[field] ??= issue.message;
    }
  }
  return { ok: false, errors };
}

/**
 * An email address passed in the page's address (`/sign-up?email=…`, sent by
 * the landing page), used only to fill in the form. Anything that is not one
 * valid address, including a repeated `?email=`, is ignored.
 */
export function prefillEmail(raw: unknown): string {
  const result = email.max(254).safeParse(raw);
  return result.success ? result.data : "";
}

export function parseSignIn(raw: unknown): Parsed<SignInInput> {
  return parse(signInSchema, raw);
}

export function parseSignUp(raw: unknown): Parsed<SignUpInput> {
  return parse(signUpSchema, raw);
}

/** The parts of a Better Auth client error that decide what we tell the user. */
export type AuthFailure = {
  readonly status?: number;
  readonly code?: string;
};

/** A plain message for a failed sign-in or sign-up. Never shows the raw error. */
export function authFailureMessage(failure: AuthFailure): string {
  if (failure.status === 429) {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (failure.code === "INVALID_EMAIL_OR_PASSWORD") {
    return "That email and password don't match.";
  }
  if (failure.code?.startsWith("USER_ALREADY_EXISTS")) {
    return "An account with that email already exists. Sign in instead.";
  }
  return "Something went wrong. Please try again.";
}
