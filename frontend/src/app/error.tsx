"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";
import { track } from "@/lib/telemetry/track";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    track({ name: "ui.error_boundary", scope: "route" });
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-ink text-2xl font-semibold">Something went wrong</h1>
      <p className="text-ink-muted">Your progress is saved on our side. Please try again.</p>
      {error.digest ? (
        <p className="text-ink-muted font-mono text-xs">Reference: {error.digest}</p>
      ) : null}
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
