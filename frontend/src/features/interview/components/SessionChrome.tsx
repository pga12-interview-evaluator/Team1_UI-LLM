"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Brand } from "@/features/workspace/WorkspaceShell";
import { publicEnv } from "@/lib/config/env";
import { Badge } from "@/components/ui";
import { useT } from "@/lib/i18n/I18nProvider";
import type { PhaseLabel } from "@/lib/api/schemas/candidate";
import { useInterviewStore } from "../store/useInterviewStore";

/**
 * Header for the candidate surface. Deliberately shows no progress bar, question counter,
 * or interview clock — only the phase label the DTO carries and connection health.
 */
export function SessionChrome({
  companyName,
  jobTitle,
  phaseLabel,
  children,
}: {
  companyName: string;
  jobTitle: string;
  phaseLabel: PhaseLabel | null;
  children: ReactNode;
}) {
  const t = useT();
  const connection = useInterviewStore((s) => s.connection);

  return (
    <div className="page-gradient flex min-h-dvh flex-col">
      <a
        href="#main"
        className="focus:bg-surface sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
      >
        {t.common.skipToContent}
      </a>
      <header className="border-line bg-surface/85 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5">
          <div className="hidden sm:block">
            <Brand />
          </div>
          <div className="min-w-0">
            <p className="text-ink truncate text-sm font-semibold">{companyName}</p>
            <p className="text-ink-muted truncate text-xs">{jobTitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {phaseLabel ? <Badge tone="brand">{t.interview.phase[phaseLabel]}</Badge> : null}
            {connection === "offline" ? (
              <Badge tone="warn" role="status">
                {t.common.offline}
              </Badge>
            ) : null}
          </div>
        </div>
      </header>
      <main
        id="main"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:py-10"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-ink-muted text-xs">Your space to focus</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Interview studio</h1>
          </div>
          <span className="environment-pill">
            {publicEnv.NEXT_PUBLIC_API_MODE === "mock"
              ? "Demo session · scripted questions"
              : "Live interview session"}
          </span>
        </div>
        {children}
      </main>
      <footer className="border-line bg-surface text-ink-muted border-t py-3 text-center text-xs">
        {t.consent.privacyNote}{" "}
        <Link href="/guide" target="_blank" className="text-brand ml-2 underline">
          Studio guide
        </Link>
      </footer>
    </div>
  );
}
