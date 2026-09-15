"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { WorkspaceShell } from "@/features/workspace/WorkspaceShell";
import { completeSession, readHistory, type PracticeSession } from "@/features/workspace/history";
import { candidateApi } from "@/lib/api/candidate";

const ENDED = new Set(["closed", "escalated", "reported"]);

interface Row extends PracticeSession {
  /** Live status from the server; null while loading or when the link is no longer valid. */
  live: string | null;
  jobTitle: string | null;
}

/**
 * Lists the practice interviews this browser started. Local history only remembers the token;
 * the server says whether each interview has ended, so a review link is never shown for a
 * session that is still running (and never hidden for one that was stopped early).
 */
export function ReviewLibrary() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const history = readHistory();
    // Browser storage is unavailable during SSR; hydrate it once after mounting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(history.map((s) => ({ ...s, live: null, jobTitle: null })));
    void Promise.all(
      history.map(async (session) => {
        try {
          const view = await candidateApi.getSession(session.token, controller.signal);
          if (ENDED.has(view.status)) completeSession(session.token);
          return { ...session, live: view.status, jobTitle: view.job_title };
        } catch {
          return { ...session, live: "unavailable", jobTitle: null };
        }
      }),
    ).then((resolved) => {
      if (!controller.signal.aborted) setRows(resolved);
    });
    return () => controller.abort();
  }, []);

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
      {rows === null ? (
        <p role="status">Loading your interviews…</p>
      ) : rows.length ? (
        <ul className="setup-card flex flex-col divide-y">
          {rows.map((row) => {
            const ended = row.live !== null && ENDED.has(row.live);
            const running = row.live !== null && !ended && row.live !== "unavailable";
            return (
              <li
                key={row.token}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium">{row.jobTitle || row.role || "Practice interview"}</p>
                  <p className="text-ink-muted flex flex-wrap items-center gap-2 text-sm">
                    {new Date(row.createdAt).toLocaleString()}
                    {row.live === null ? (
                      <Badge>checking…</Badge>
                    ) : ended ? (
                      <Badge tone="ok">finished</Badge>
                    ) : running ? (
                      <Badge tone="warn">in progress</Badge>
                    ) : (
                      <Badge>link expired</Badge>
                    )}
                  </p>
                </div>
                {ended ? (
                  <Link className="action-link" href={`/i/${encodeURIComponent(row.token)}/review`}>
                    Open review <Icon name="arrow" size={16} />
                  </Link>
                ) : running ? (
                  <Link className="action-link" href={`/i/${encodeURIComponent(row.token)}`}>
                    Resume interview <Icon name="arrow" size={16} />
                  </Link>
                ) : null}
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
          <p>
            Interviews are listed in the browser they were started from. Finish a practice interview
            and its review appears here.
          </p>
          <Link href="/setup" className="action-link">
            Start an interview <Icon name="arrow" size={16} />
          </Link>
        </div>
      )}
    </WorkspaceShell>
  );
}
