"use client";

// Confine a failed data load to Transactions. The signed-in navigation and
// other pages remain available, and a retry does not discard saved data.
export default function TransactionsError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="page">
      <h1>Transactions</h1>
      <p role="alert">
        Transactions are temporarily unavailable. Please try again.
      </p>
      <button type="button" onClick={retry}>
        Try again
      </button>
    </main>
  );
}
