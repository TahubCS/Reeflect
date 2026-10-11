"use client";
export default function RecurringError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="page">
      <h1>Recurring payments</h1>
      <p role="alert">
        Recurring payments are temporarily unavailable. Please try again.
      </p>
      <button type="button" onClick={retry}>
        Try again
      </button>
    </main>
  );
}
