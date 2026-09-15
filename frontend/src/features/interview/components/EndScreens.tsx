"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, Button, Card, CardBody, CardHeader } from "@/components/ui";
import { candidateApi } from "@/lib/api/candidate";
import { ApiError } from "@/lib/api/client";
import type { CandidateTurnDto } from "@/lib/api/schemas/candidate";
import { useT } from "@/lib/i18n/I18nProvider";
import { useInterviewStore } from "../store/useInterviewStore";

export function PausedScreen({
  token,
  turn,
  language,
}: {
  token: string;
  turn: CandidateTurnDto | null;
  language: string;
}) {
  const t = useT();
  const dispatch = useInterviewStore((s) => s.dispatch);
  const [busy, setBusy] = useState(false);
  const resume = async () => {
    setBusy(true);
    dispatch({ type: "REQUEST_START" });
    try {
      const next = await candidateApi.sendRequest(token, { type: "resume" });
      dispatch({ type: "REQUEST_OK", view: next });
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      dispatch({
        type: "REQUEST_FAIL",
        message: apiError?.message ?? t.common.errorBody,
        retryable: true,
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader title={t.interview.paused.title} />
      <CardBody className="flex flex-col gap-4">
        <p className="text-[17px]" lang={language} aria-live="polite">
          {turn?.candidate_message ?? t.interview.paused.body}
        </p>
        <div className="flex justify-end">
          <Button size="lg" onClick={resume} loading={busy}>
            {t.interview.paused.resume}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export function ClosingScreen({
  turn,
  language,
}: {
  turn: CandidateTurnDto | null;
  language: string;
}) {
  const t = useT();
  return (
    <Card>
      <CardHeader title={t.interview.closing.title} />
      <CardBody className="flex flex-col gap-3">
        <p className="text-[17px] leading-relaxed" lang={language} aria-live="polite">
          {turn?.candidate_message ?? t.interview.closing.body}
        </p>
        <p className="text-ink-muted text-sm">{t.interview.closing.canClose}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="action-link" href="/">
            Back to workspace
          </Link>
          <Link className="action-link" href="/console/sessions">
            Review interviews
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}

export function EscalatedScreen({
  language,
  message,
}: {
  language: string;
  message: string | null;
}) {
  const t = useT();
  return (
    <Card>
      <CardHeader title={t.interview.escalated.title} />
      <CardBody>
        <p className="text-[17px] leading-relaxed" lang={language} aria-live="polite">
          {message ?? t.interview.escalated.body}
        </p>
      </CardBody>
    </Card>
  );
}

export function ErrorScreen({
  message,
  retryable,
  onRetry,
}: {
  message: string;
  retryable: boolean;
  onRetry: () => void;
}) {
  const t = useT();
  return (
    <div className="mx-auto w-full max-w-xl">
      <Alert tone="bad" title={t.common.errorTitle}>
        <p>{message}</p>
        <p className="mt-1 text-sm">{t.common.errorBody}</p>
        {retryable ? (
          <div className="mt-3">
            <Button variant="secondary" onClick={onRetry}>
              {t.common.retry}
            </Button>
          </div>
        ) : null}
      </Alert>
    </div>
  );
}
