"use client";

import { useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader } from "@/components/ui";
import { candidateApi } from "@/lib/api/candidate";
import { ApiError } from "@/lib/api/client";
import type { CandidateSessionView } from "@/lib/api/schemas/candidate";
import { useT } from "@/lib/i18n/I18nProvider";
import { useInterviewStore } from "../store/useInterviewStore";

/** Renders the backend's opening_disclosure verbatim (already in interview_language). Never composed here. */
export function DisclosureStep({ token, view }: { token: string; view: CandidateSessionView }) {
  const t = useT();
  const dispatch = useInterviewStore((s) => s.dispatch);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = async () => {
    setBusy(true);
    setError(null);
    dispatch({ type: "REQUEST_START" });
    try {
      const next = await candidateApi.start(token);
      dispatch({ type: "REQUEST_OK", view: next });
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : t.common.errorBody;
      setError(message);
      dispatch({ type: "REQUEST_FAIL", message, retryable: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader title={t.disclosure.title} />
      <CardBody className="flex flex-col gap-5">
        <p className="text-ink text-[17px] leading-relaxed" lang={view.interview_language}>
          {view.opening_disclosure}
        </p>
        {error ? <Alert tone="bad">{error}</Alert> : null}
        <div className="flex justify-end">
          <Button size="lg" onClick={begin} loading={busy}>
            {t.disclosure.begin}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
