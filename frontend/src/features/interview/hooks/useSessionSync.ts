"use client";

import { useEffect, useRef } from "react";
import { candidateApi } from "@/lib/api/candidate";
import { ApiError } from "@/lib/api/client";
import { sessionEventSchema } from "@/lib/api/schemas/candidate";
import { track } from "@/lib/telemetry/track";
import { useInterviewStore } from "../store/useInterviewStore";

const POLL_MS = 2000;
const POLL_IDLE_MS = 8000;

/**
 * Keeps the store in sync with the server: initial load, SSE stream of session events,
 * and a polling fallback when SSE is unavailable. The server view is authoritative.
 */
export function useSessionSync(token: string) {
  const init = useInterviewStore((s) => s.init);
  const dispatch = useInterviewStore((s) => s.dispatch);
  const setConnection = useInterviewStore((s) => s.setConnection);
  const uiKind = useInterviewStore((s) => s.ui.kind);
  const sseFailed = useRef(false);

  useEffect(() => {
    init(token);
    const controller = new AbortController();
    candidateApi
      .getSession(token, controller.signal)
      .then((view) => dispatch({ type: "LOAD_OK", view }))
      .catch((error: unknown) => {
        if ((error as Error).name === "AbortError") return;
        const apiError = error instanceof ApiError ? error : null;
        if (apiError?.code === "contract_violation")
          track({ name: "candidate.contract_violation", path: "getSession" });
        dispatch({
          type: "LOAD_FAIL",
          message:
            apiError?.status === 404
              ? "This interview link is not valid or has expired."
              : "Could not load the interview.",
          retryable: apiError ? apiError.isRetryable : true,
        });
      });
    return () => controller.abort();
  }, [token, init, dispatch]);

  // SSE
  useEffect(() => {
    if (typeof EventSource === "undefined") {
      sseFailed.current = true;
      setConnection("polling");
      return;
    }
    const source = new EventSource(candidateApi.eventsUrl(token), { withCredentials: true });
    source.onopen = () => setConnection("live");
    source.onmessage = (message) => {
      try {
        const parsed = sessionEventSchema.safeParse(JSON.parse(message.data as string));
        if (!parsed.success) {
          track({ name: "candidate.contract_violation", path: "events" });
          return;
        }
        if (parsed.data.type === "turn" || parsed.data.type === "status") {
          dispatch({ type: "SERVER_PUSH", view: parsed.data.session });
        }
      } catch {
        /* malformed frame: ignore, polling covers it */
      }
    };
    source.onerror = () => {
      sseFailed.current = true;
      setConnection("polling");
      source.close();
    };
    return () => source.close();
  }, [token, dispatch, setConnection]);

  // Polling fallback: fast while waiting on the server, slow otherwise, off when finished.
  useEffect(() => {
    if (uiKind === "closing" || uiKind === "escalated" || uiKind === "loading") return;
    const waiting = uiKind === "submitting" || uiKind === "requesting";
    const interval = waiting ? POLL_MS : POLL_IDLE_MS;
    const timer = setInterval(() => {
      if (!sseFailed.current && !waiting) return;
      candidateApi
        .getSession(token)
        .then((view) => dispatch({ type: "SERVER_PUSH", view }))
        .catch(() => setConnection(navigator.onLine ? "polling" : "offline"));
    }, interval);
    return () => clearInterval(timer);
  }, [token, uiKind, dispatch, setConnection]);

  useEffect(() => {
    const onOnline = () => setConnection(sseFailed.current ? "polling" : "live");
    const onOffline = () => setConnection("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [setConnection]);
}
