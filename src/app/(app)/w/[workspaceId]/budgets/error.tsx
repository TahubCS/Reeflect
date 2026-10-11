"use client";
export default function BudgetsError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="page">
      <h1>Budgets</h1>
      <p role="alert">Budgets are temporarily unavailable. Please try again.</p>
      <button type="button" onClick={retry}>
        Try again
      </button>
    </main>
  );
}
