import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { verificationLinkMessage } from "@/features/auth/domain/credentials";
import { AFTER_AUTH_PATH } from "@/features/auth/domain/paths";
import { LinkProblem } from "@/features/auth/ui/link-problem";

export const metadata: Metadata = { title: "Confirm your email" };

// A verification link lands here (ADR-051). Better Auth has already checked
// it: on success the person is signed in and goes on to their calendar; on
// failure Better Auth adds `?error=…`.
export default function EmailVerifiedPage({
  searchParams,
}: PageProps<"/email-verified">) {
  return (
    <Suspense fallback={null}>
      <EmailVerified searchParams={searchParams} />
    </Suspense>
  );
}

async function EmailVerified({
  searchParams,
}: Pick<PageProps<"/email-verified">, "searchParams">) {
  const { error } = await searchParams;
  if (error === undefined) redirect(AFTER_AUTH_PATH);
  return (
    <LinkProblem
      title="We couldn't confirm your email"
      message={verificationLinkMessage(error)}
    >
      <Link href="/sign-in">Sign in</Link>
    </LinkProblem>
  );
}
