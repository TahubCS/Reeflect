"use client";
export default function BillsError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="page">
      <h1>Bills</h1>
      <p role="alert">Bills are temporarily unavailable. Please try again.</p>
      <button type="button" onClick={retry}>
        Try again
      </button>
    </main>
  );
}
