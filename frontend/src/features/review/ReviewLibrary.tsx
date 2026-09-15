"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { WorkspaceShell } from "@/features/workspace/WorkspaceShell";
import { readHistory, type PracticeSession } from "@/features/workspace/history";

/** Lists the practice interviews this browser started; each opens its post-interview review. */
export function ReviewLibrary() {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  useEffect(() => {
    // Browser storage is unavailable during SSR; hydrate it once after mounting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessions(readHistory());
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
      {sessions.length ? (
        <ul className="setup-card flex flex-col divide-y">
          {sessions.map((session) => (
            <li
              key={session.token}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="font-medium">{session.role || "Practice interview"}</p>
                <p className="text-ink-muted text-sm">
                  {new Date(session.createdAt).toLocaleString()} ·{" "}
                  {session.status === "completed" ? "finished" : "in progress"}
                </p>
              </div>
              <Link
                className="action-link"
                href={
                  session.status === "completed"
                    ? `/i/${encodeURIComponent(session.token)}/review`
                    : `/i/${encodeURIComponent(session.token)}`
                }
              >
                {session.status === "completed" ? "Open review" : "Resume interview"}{" "}
                <Icon name="arrow" size={16} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="setup-card empty-interviews">
          <span className="empty-orbit">
            <Icon name="chart" size={27} />
          </span>
          <h3>No interviews to review yet</h3>
          <p>Finish a practice interview and your review appears here.</p>
          <Link href="/setup" className="action-link">
            Start an interview <Icon name="arrow" size={16} />
          </Link>
        </div>
      )}
    </WorkspaceShell>
  );
}
