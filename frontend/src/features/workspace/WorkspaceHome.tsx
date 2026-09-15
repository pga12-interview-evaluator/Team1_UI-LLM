"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { WorkspaceShell } from "./WorkspaceShell";
import { readHistory, type PracticeSession } from "./history";
export function WorkspaceHome() {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  useEffect(() => {
    // Browser storage is unavailable during SSR; hydrate it once after mounting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessions(readHistory());
  }, []);
  return (
    <WorkspaceShell
      title="Let’s get you interview-ready."
      subtitle="A space to practice, find your voice, and take the next step."
    >
      <section className="home-hero">
        <div className="home-hero-copy">
          <span className="hero-tag">
            <Icon name="spark" size={15} /> Your personal interview studio
          </span>
          <h2>
            Big ambitions.
            <br />
            Better conversations.
          </h2>
          <p>
            Turn your experience into a great interview.
            <br className="desktop-break" /> Bring your resume. We’ll take it from there.
          </p>
          <Link href="/setup" className="action-link action-white">
            Start an interview <Icon name="arrow" size={18} />
          </Link>
          <span className="hero-footnote">Your resume. Your pace. Your next chapter.</span>
        </div>
        <div className="hero-illustration" aria-hidden="true">
          <div className="orbital orbital-one" />
          <div className="orbital orbital-two" />
          <div className="illustration-stars">✦</div>
          <div className="illustration-resume">
            <span className="resume-portrait">
              <Icon name="file" size={28} />
            </span>
            <div>
              <b>Your experience</b>
              <span className="resume-line" />
              <span className="resume-line short" />
            </div>
            <span className="resume-check">
              <Icon name="check" size={15} />
            </span>
          </div>
          <div className="illustration-window">
            <div className="window-chrome">
              <span />
              <span />
              <span />
              <small>Interview studio</small>
            </div>
            <div className="ai-orb">
              <Icon name="spark" size={48} />
            </div>
            <p>Let’s talk about your work.</p>
            <div className="waveform">
              {[12, 22, 15, 30, 42, 22, 32, 50, 30, 20, 38, 25, 14, 24, 12].map((h, i) => (
                <i key={i} style={{ height: h }} />
              ))}
            </div>
            <div className="illustration-caption">
              <span /> A conversation built around you
            </div>
          </div>
          <div className="illustration-note">
            <span>✦</span>
            <div>
              One answer at a time.<small>Room to think. Space to grow.</small>
            </div>
          </div>
        </div>
      </section>
      <div className="workspace-section-title">
        <h2>Your next interview, in three steps</h2>
        <span>A little preparation goes a long way</span>
      </div>
      <div className="journey-grid">
        <Journey
          number="01"
          icon="file"
          title="Bring your experience"
          text="Upload your resume and choose the role you’re preparing for."
          tone="lilac"
        />
        <Journey
          number="02"
          icon="mic"
          title="Have the conversation"
          text="Answer by voice or text, with camera and screen sharing in your studio."
          tone="peach"
        />
        <Journey
          number="03"
          icon="chart"
          title="Reflect and improve"
          text="Revisit your recording and open your assessment in the review workspace."
          tone="mint"
        />
      </div>
      <div className="home-bottom-grid">
        <section className="recent-panel">
          <div className="workspace-section-title">
            <h2>Your interviews</h2>
            <span>{sessions.length ? `${sessions.length} in this browser` : "A fresh start"}</span>
          </div>
          {sessions.length ? (
            <div className="recent-list">
              {sessions.slice(0, 4).map((s) => (
                <Link key={s.token} href={`/i/${s.token}`} className="recent-session">
                  <span className="icon-tile lilac">
                    <Icon name="mic" />
                  </span>
                  <span>
                    <strong>{s.role}</strong>
                    <small>
                      {new Date(s.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      · {s.status === "completed" ? "Completed" : "Open session"}
                    </small>
                  </span>
                  <Icon name="arrow" size={18} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-interviews">
              <span className="empty-orbit">
                <Icon name="mic" size={28} />
              </span>
              <h3>Your first conversation starts here</h3>
              <p>
                Every great interview starts with a little practice.
                <br />
                Start a session and it will appear here.
              </p>
              <Link href="/setup">
                Create your first interview <Icon name="arrow" size={16} />
              </Link>
            </div>
          )}
        </section>
        <section className="preparation-panel">
          <span className="icon-tile peach">
            <Icon name="book" size={24} />
          </span>
          <p className="section-kicker">Before you begin</p>
          <h2>
            A clear mind.
            <br />A stronger answer.
          </h2>
          <p>
            Find a quiet corner, check your devices, and keep a project you’re proud of in mind.
          </p>
          <Link href="/guide">
            Your preparation checklist <Icon name="arrow" size={17} />
          </Link>
          <div className="prep-doodle" aria-hidden="true">
            ✺
          </div>
        </section>
      </div>
      <div className="workspace-capabilities">
        <span>
          <Icon name="file" size={17} /> Resume-led setup
        </span>
        <span>
          <Icon name="screen" size={17} /> Screen sharing
        </span>
        <span>
          <Icon name="video" size={17} /> Session recording
        </span>
        <span>
          <Icon name="shield" size={17} /> Consent comes first
        </span>
      </div>
    </WorkspaceShell>
  );
}
function Journey({
  number,
  icon,
  title,
  text,
  tone,
}: {
  number: string;
  icon: IconName;
  title: string;
  text: string;
  tone: string;
}) {
  return (
    <div className="journey-card">
      <span className={`icon-tile ${tone}`}>
        <Icon name={icon} size={24} />
      </span>
      <span className="journey-number">{number}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
