"use client";
export default function TransferError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="page">
      <h1>Review transfers</h1>
      <p role="alert">
        Transfer review is temporarily unavailable. Please try again.
      </p>
      <button type="button" onClick={retry}>
        Try again
      </button>
    </main>
  );
}
