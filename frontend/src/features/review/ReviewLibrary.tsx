"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Badge } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { WorkspaceShell } from "@/features/workspace/WorkspaceShell";
import { readHistory } from "@/features/workspace/history";
import { candidateApi } from "@/lib/api/candidate";
import type { PracticeSessionList } from "@/lib/api/schemas/review";

const ENDED = new Set(["closed", "escalated", "reported"]);
const NEVER_STARTED = new Set(["awaiting_consent", "device_check", "ready", "disclosed"]);

type Row = PracticeSessionList["items"][number];

/**
 * Practice interviews to review. The server is the source of truth (practice mode has no
 * accounts, so it lists every practice session on this machine); browser history only adds
 * links this browser started that the server no longer knows about.
 */
export function ReviewLibrary() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    candidateApi
      .listPracticeSessions(controller.signal)
      .then((list) => {
        const known = new Set(list.items.map((item) => item.token));
        const local: Row[] = readHistory()
          .filter((s) => !known.has(s.token))
          .map((s) => ({
            token: s.token,
            job_title: s.role,
            candidate_label: "",
            status: s.status === "completed" ? "closed" : "unknown",
            created_at: s.createdAt,
            ended_at: null,
            questions_answered: 0,
          }));
        setRows([...list.items, ...local]);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "Could not load your interviews.");
        setRows([]);
      });
    return () => controller.abort();
  }, []);

  const visible = (rows ?? []).filter((row) => !NEVER_STARTED.has(row.status));

  return (
    <WorkspaceShell
      title="Review & insights"
      subtitle="What you did well, what to sharpen, and how you came across — per answer and overall."
    >
      <div className="integration-notice">
        <Icon name="chart" size={18} />
        <p>
          Reviews are generated from your own practice interviews: content scores from the
          evaluator, delivery notes from your transcript, and camera coaching signals when you
          allowed them. Camera and speech notes never affect your score.
        </p>
      </div>
      {error ? <Alert tone="bad">{error}</Alert> : null}
      {rows === null ? (
        <p role="status">Loading your interviews…</p>
      ) : visible.length ? (
        <ul className="setup-card flex flex-col divide-y">
          {visible.map((row) => {
            const ended = ENDED.has(row.status);
            return (
              <li
                key={row.token}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium">
                    {row.job_title || "Practice interview"}
                    {row.candidate_label ? (
                      <span className="text-ink-muted font-normal"> · {row.candidate_label}</span>
                    ) : null}
                  </p>
                  <p className="text-ink-muted flex flex-wrap items-center gap-2 text-sm">
                    {new Date(row.created_at).toLocaleString()}
                    {ended ? (
                      <Badge tone="ok">
                        finished · {row.questions_answered} question
                        {row.questions_answered === 1 ? "" : "s"}
                      </Badge>
                    ) : row.status === "unknown" ? (
                      <Badge>link no longer on this server</Badge>
                    ) : (
                      <Badge tone="warn">in progress</Badge>
                    )}
                  </p>
                </div>
                {ended ? (
                  <Link className="action-link" href={`/i/${encodeURIComponent(row.token)}/review`}>
                    Open review <Icon name="arrow" size={16} />
                  </Link>
                ) : row.status === "unknown" ? null : (
                  <Link className="action-link" href={`/i/${encodeURIComponent(row.token)}`}>
                    Resume interview <Icon name="arrow" size={16} />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="setup-card empty-interviews">
          <span className="empty-orbit">
            <Icon name="chart" size={27} />
          </span>
          <h3>No interviews to review yet</h3>
          <p>Finish a practice interview and its review appears here.</p>
          <Link href="/setup" className="action-link">
            Start an interview <Icon name="arrow" size={16} />
          </Link>
        </div>
      )}
    </WorkspaceShell>
  );
}
