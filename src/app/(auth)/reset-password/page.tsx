import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { resetToken } from "@/features/auth/domain/credentials";
import { LinkProblem } from "@/features/auth/ui/link-problem";
import { ResetPasswordForm } from "@/features/auth/ui/reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

// Better Auth checks the emailed link and sends `?token=…` when it is good,
// or `?error=INVALID_TOKEN` when it is not (ADR-052). Search params are only
// known at request time, so they are read inside <Suspense>.
export default function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  return (
    <Suspense fallback={null}>
      <ResetPassword searchParams={searchParams} />
    </Suspense>
  );
}

async function ResetPassword({
  searchParams,
}: Pick<PageProps<"/reset-password">, "searchParams">) {
  const { token } = await searchParams;
  const valid = resetToken(token);
  if (valid === null) {
    return (
      <LinkProblem
        title="That reset link has expired"
        message="Reset links work for one hour and only once."
      >
        <Link href="/forgot-password">Send a new link</Link>
      </LinkProblem>
    );
  }
  return <ResetPasswordForm token={valid} />;
}
