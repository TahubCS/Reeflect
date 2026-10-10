import type { Metadata } from "next";
import { Suspense } from "react";
import { prefillEmail } from "@/features/auth/domain/credentials";
import { AuthForm } from "@/features/auth/ui/auth-form";

export const metadata: Metadata = { title: "Create your account" };

// The landing page sends `/sign-up?email=…` so the address isn't typed twice.
// Search params are only known at request time, so they are read inside
// <Suspense>: the empty form prerenders as the static shell (Cache Components),
// and the filled-in one streams in.
export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  return (
    <Suspense fallback={<AuthForm mode="sign-up" />}>
      <PrefilledSignUp searchParams={searchParams} />
    </Suspense>
  );
}

async function PrefilledSignUp({
  searchParams,
}: Pick<PageProps<"/sign-up">, "searchParams">) {
  const { email } = await searchParams;
  return <AuthForm mode="sign-up" defaultEmail={prefillEmail(email)} />;
}
