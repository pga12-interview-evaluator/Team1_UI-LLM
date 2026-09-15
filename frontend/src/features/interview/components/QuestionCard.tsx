"use client";

import { useEffect, useState } from "react";
import { Button, Card, CardBody } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import type { CandidateTurnDto } from "@/lib/api/schemas/candidate";
import { useT } from "@/lib/i18n/I18nProvider";

const BRIDGE_DELAY_MS = 1500;

interface Props {
  turn: CandidateTurnDto | null;
  language: string;
  /** True while the server is evaluating; shows one neutral bridge line after 1.5 s. */
  waiting: boolean;
  readAloud: boolean;
}

/**
 * The only place model text is rendered. Text comes from `candidate_message` verbatim.
 * The bridge line is fixed and identical for every candidate; it never varies with flags.
 */
export function QuestionCard({ turn, language, waiting, readAloud }: Props) {
  const t = useT();

  useEffect(() => {
    if (!readAloud || !turn || typeof speechSynthesis === "undefined") return;
    const utterance = new SpeechSynthesisUtterance(turn.candidate_message);
    utterance.lang = language;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
    return () => speechSynthesis.cancel();
  }, [turn, readAloud, language]);

  return (
    <Card className="border-brand/15 shadow-lift">
      <CardBody className="flex flex-col gap-3 py-7">
        <div className="studio-question-mark">
          <span className="ai-orb">
            <Icon name="spark" size={25} />
          </span>
          <div>
            <p className="text-sm font-semibold">{t.interview.interviewerLabel}</p>
            <p className="text-ink-muted mt-1 text-xs">
              {waiting ? "Preparing the next turn" : "Take a moment. Then talk us through it."}
            </p>
          </div>
          {!waiting && turn && (
            <Button
              className="ml-auto"
              size="sm"
              variant="ghost"
              aria-label="Read question aloud"
              onClick={() => {
                if (typeof speechSynthesis === "undefined") return;
                speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(turn.candidate_message);
                utterance.lang = language;
                speechSynthesis.speak(utterance);
              }}
            >
              <Icon name="play" size={15} />
              <span className="hidden sm:inline">Listen</span>
            </Button>
          )}
        </div>
        <div aria-live="polite" aria-atomic="true" className="min-h-16">
          {waiting ? (
            <BridgeLine text={t.interview.bridge1} language={language} />
          ) : turn ? (
            <p
              key={turn.turn_index}
              className="text-ink text-[19px] leading-relaxed"
              lang={language}
            >
              {turn.candidate_message}
            </p>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

/** Mounted only while waiting; unmounting resets it, so no state reset effect is needed. */
function BridgeLine({ text, language }: { text: string; language: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShow(true), BRIDGE_DELAY_MS);
    return () => clearTimeout(id);
  }, []);
  return (
    <p className="text-ink-muted text-[19px] leading-relaxed" lang={language}>
      {show ? text : " "}
    </p>
  );
}
