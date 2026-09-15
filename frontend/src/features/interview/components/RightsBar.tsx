"use client";

import { useState } from "react";
import { Button, Dialog } from "@/components/ui";
import { candidateApi } from "@/lib/api/candidate";
import { ApiError } from "@/lib/api/client";
import type { AccommodationCode, CandidateRequestPayload } from "@/lib/api/schemas/candidate";
import { useT } from "@/lib/i18n/I18nProvider";
import { track } from "@/lib/telemetry/track";
import { useInterviewStore } from "../store/useInterviewStore";

const CODES: AccommodationCode[] = [
  "extended_answer_time",
  "text_modality",
  "voice_modality",
  "read_aloud",
  "captions",
  "breaks",
  "camera_off",
  "no_behavioral_analysis",
  "high_contrast",
  "human_interviewer",
];

/**
 * Always-visible candidate rights (guide §14): Repeat · Rephrase · Break · Adjustment · Stop.
 * Every action is a backend request; the UI never decides what changes, it only asks.
 */
export function RightsBar({
  token,
  disabled,
  applied,
}: {
  token: string;
  disabled: boolean;
  applied: AccommodationCode[];
}) {
  const t = useT();
  const dispatch = useInterviewStore((s) => s.dispatch);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [code, setCode] = useState<AccommodationCode>("extended_answer_time");
  const [busy, setBusy] = useState(false);

  const send = async (payload: CandidateRequestPayload) => {
    setBusy(true);
    dispatch({ type: "REQUEST_START" });
    try {
      const next = await candidateApi.sendRequest(token, payload);
      track({ name: "candidate.request", type: payload.type });
      dispatch({ type: "REQUEST_OK", view: next });
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : null;
      dispatch({
        type: "REQUEST_FAIL",
        message: apiError?.message ?? t.common.errorBody,
        retryable: apiError ? apiError.isRetryable : true,
      });
    } finally {
      setBusy(false);
      setAdjustOpen(false);
      setStopOpen(false);
    }
  };

  const items: {
    key: CandidateRequestPayload["type"] | "adjustment";
    label: string;
    help: string;
    onClick: () => void;
  }[] = [
    {
      key: "repeat",
      label: t.interview.rights.repeat,
      help: t.interview.rights.repeatHelp,
      onClick: () => void send({ type: "repeat" }),
    },
    {
      key: "rephrase",
      label: t.interview.rights.rephrase,
      help: t.interview.rights.rephraseHelp,
      onClick: () => void send({ type: "rephrase" }),
    },
    {
      key: "break",
      label: t.interview.rights.break,
      help: t.interview.rights.breakHelp,
      onClick: () => void send({ type: "break" }),
    },
    {
      key: "adjustment",
      label: t.interview.rights.adjustment,
      help: t.interview.rights.adjustmentHelp,
      onClick: () => setAdjustOpen(true),
    },
    {
      key: "stop",
      label: t.interview.rights.stop,
      help: t.interview.rights.stopHelp,
      onClick: () => setStopOpen(true),
    },
  ];

  return (
    <nav
      aria-label={t.interview.rights.title}
      className="rounded-card border-line bg-surface border px-3 py-2"
    >
      <p className="text-ink-muted px-1 text-xs font-semibold tracking-wide uppercase">
        {t.interview.rights.title}
      </p>
      <ul className="mt-1 flex flex-wrap gap-1">
        {items.map((item) => (
          <li key={item.key}>
            <Button
              variant={item.key === "stop" ? "danger" : "ghost"}
              size="sm"
              onClick={item.onClick}
              disabled={disabled || busy}
              aria-label={`${item.label}. ${item.help}`}
            >
              {item.label}
            </Button>
          </li>
        ))}
      </ul>

      <Dialog
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title={t.interview.adjustment.title}
        description={t.interview.adjustment.body}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjustOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button onClick={() => void send({ type: "adjustment", code })} loading={busy}>
              {t.interview.adjustment.apply}
            </Button>
          </>
        }
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t.interview.adjustment.title}</legend>
          {CODES.map((option) => {
            const already = applied.includes(option);
            return (
              <label
                key={option}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${already ? "border-line opacity-60" : "border-line hover:bg-surface-2"}`}
              >
                <input
                  type="radio"
                  name="accommodation"
                  value={option}
                  checked={code === option}
                  disabled={already}
                  onChange={() => setCode(option)}
                  className="mt-1 accent-[var(--brand)]"
                />
                <span className="text-[15px]">
                  {t.interview.adjustment.codes[option]}
                  {already ? (
                    <span className="text-ink-muted ml-2 text-xs">({t.common.yes})</span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </fieldset>
      </Dialog>

      <Dialog
        open={stopOpen}
        onClose={() => setStopOpen(false)}
        title={t.interview.stopConfirm.title}
        description={t.interview.stopConfirm.body}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => void send({ type: "break" })}
              disabled={busy}
            >
              {t.interview.stopConfirm.breakInstead}
            </Button>
            <Button variant="danger" onClick={() => void send({ type: "stop" })} loading={busy}>
              {t.interview.stopConfirm.confirm}
            </Button>
          </>
        }
      >
        <span className="sr-only">{t.interview.stopConfirm.body}</span>
      </Dialog>
    </nav>
  );
}
