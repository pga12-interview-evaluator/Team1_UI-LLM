"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h1>Something went wrong</h1>
        <p>Your progress is saved on our side. Please reload the page.</p>
        <button type="button" onClick={reset} style={{ padding: "8px 16px" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
