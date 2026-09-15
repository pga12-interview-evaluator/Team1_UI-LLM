"use client";

import { useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, Checkbox } from "@/components/ui";
import { candidateApi } from "@/lib/api/candidate";
import { ApiError } from "@/lib/api/client";
import type { CandidateSessionView } from "@/lib/api/schemas/candidate";
import { useT } from "@/lib/i18n/I18nProvider";
import { track } from "@/lib/telemetry/track";
import { useInterviewStore } from "../store/useInterviewStore";

export function ConsentStep({ token, view }: { token: string; view: CandidateSessionView }) {
  const t = useT();
  const dispatch = useInterviewStore((s) => s.dispatch);
  const [notice, setNotice] = useState(false);
  const [recording, setRecording] = useState(true);
  const [behavioral, setBehavioral] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!notice) return;
    setBusy(true);
    setError(null);
    try {
      const next = await candidateApi.submitConsent(token, {
        ai_interview_notice_ack: true,
        recording_consent: recording,
        behavioral_analysis_consent: recording && behavioral,
        notice_version: view.consent.notice_version,
      });
      track({
        name: "candidate.consent_submitted",
        behavioral: recording && behavioral,
        recording,
      });
      dispatch({ type: "REQUEST_OK", view: next });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t.common.errorBody);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader title={t.consent.title} description={t.consent.intro} />
      <CardBody className="flex flex-col gap-5">
        <Checkbox
          checked={notice}
          onChange={(e) => setNotice(e.target.checked)}
          label={t.consent.noticeLabel}
        />
        <Checkbox
          checked={recording}
          onChange={(e) => {
            setRecording(e.target.checked);
            if (!e.target.checked) setBehavioral(false);
          }}
          label={t.consent.recordingLabel}
        />
        <Checkbox
          checked={behavioral}
          disabled={!recording}
          onChange={(e) => setBehavioral(e.target.checked)}
          label={t.consent.behavioralLabel}
          hint={t.consent.behavioralHelp}
        />
        <p className="text-ink-muted text-sm">{t.consent.modalityHint}</p>
        <div className="bg-brand-soft text-ink-muted rounded-xl p-4 text-xs leading-relaxed">
          If you allow recording, the studio will record your microphone and camera during the
          conversation. You can choose to include a shared screen. Recording pauses on breaks and
          saves in this browser when you finish. You can download a copy; screen audio and the
          read-aloud voice are not included.
        </div>
        {error ? <Alert tone="bad">{error}</Alert> : null}
        <div className="flex justify-end">
          <Button size="lg" onClick={submit} disabled={!notice} loading={busy}>
            {t.consent.submit}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
