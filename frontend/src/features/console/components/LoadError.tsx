"use client";

import type { Route } from "next";
import Link from "next/link";
import { Alert, Button } from "@/components/ui";
import { ApiError } from "@/lib/api/client";

/** Consistent load-failure message for console pages; distinguishes "gone" from "unavailable". */
export function LoadError({
  error,
  what,
  backHref,
  onRetry,
}: {
  error: unknown;
  what: string;
  backHref: Route;
  onRetry?: () => void;
}) {
  const apiError = error instanceof ApiError ? error : null;
  const notFound = apiError?.status === 404;
  const unauthenticated = apiError?.status === 401;
  return (
    <Alert
      tone={notFound ? "warn" : "bad"}
      title={
        notFound
          ? `This ${what} no longer exists`
          : unauthenticated
            ? "Your session has expired"
            : `Could not load this ${what}`
      }
    >
      <p className="text-sm">
        {notFound
          ? "It may have been removed, or the server was restarted (mock mode keeps sessions in memory)."
          : unauthenticated
            ? "Sign in again to continue."
            : (apiError?.message ?? "Please try again.")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={unauthenticated ? ("/console/login" as Route) : backHref}>
          <Button variant="secondary" size="sm">
            {unauthenticated ? "Sign in" : "Back"}
          </Button>
        </Link>
        {onRetry && !notFound ? (
          <Button variant="ghost" size="sm" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    </Alert>
  );
}
