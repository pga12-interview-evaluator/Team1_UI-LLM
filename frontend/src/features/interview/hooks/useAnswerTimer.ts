"use client";

import { useEffect, useRef, useState } from "react";

const WARNING_SECONDS = 10;

interface Options {
  /** From the DTO. null disables the timer (extended_answer_time accommodation). */
  maxAnswerSeconds: number | null;
  /** Epoch ms when the current turn was rendered (store.answerStartedAt). null = not started. */
  startedAt: number | null;
  /** Identity of the current turn; expiry fires at most once per key. */
  resetKey: string | number;
  running: boolean;
  onExpire: () => void;
}

/**
 * Per-answer countdown from the DTO's max_answer_seconds, derived from a server-anchored start
 * time rather than accumulated ticks. The server still auto-submits authoritatively; this copy
 * drives the visible clock and the local auto-submit.
 */
export function useAnswerTimer({
  maxAnswerSeconds,
  startedAt,
  resetKey,
  running,
  onExpire,
}: Options) {
  const [now, setNow] = useState(() => Date.now());
  const expiredFor = useRef<string | number | null>(null);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (maxAnswerSeconds === null || !running || startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [maxAnswerSeconds, running, startedAt, resetKey]);

  const remaining =
    maxAnswerSeconds === null || startedAt === null
      ? null
      : Math.max(0, Math.ceil(maxAnswerSeconds - (now - startedAt) / 1000));

  useEffect(() => {
    if (remaining === 0 && running && expiredFor.current !== resetKey) {
      expiredFor.current = resetKey;
      onExpireRef.current();
    }
  }, [remaining, running, resetKey]);

  return {
    remaining,
    warning: remaining !== null && remaining <= WARNING_SECONDS && remaining > 0,
    expired: remaining === 0,
  };
}
