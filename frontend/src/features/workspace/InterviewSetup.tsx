"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { upload } from "@/lib/api/client";
import { practiceCreatedSchema, practiceInputSchema, resumeError } from "@/lib/api/schemas/setup";
import { publicEnv } from "@/lib/config/env";
import { saveSession } from "./history";
import { WorkspaceShell } from "./WorkspaceShell";
export function InterviewSetup() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [role, setRole] = useState("");
  const [duration, setDuration] = useState("30");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const choose = (next?: File) => {
    if (!next) return;
    const problem = resumeError(next);
    setError(problem);
    if (!problem) setFile(next);
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    if (!file) {
      setError("Upload your resume to continue.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const parsed = practiceInputSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your interview details.");
      return;
    }
    form.set("resume", file);
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await upload("/candidate/sessions", form, practiceCreatedSchema);
      saveSession({
        token: result.invite_token,
        sessionId: result.session_id,
        role: parsed.data.job_title,
        createdAt: new Date().toISOString(),
        status: "started",
      });
      router.push(`/i/${result.invite_token}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "We couldn’t create your session. Try again.",
      );
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <WorkspaceShell
      title="Make this interview yours."
      subtitle="A few details now. A conversation that fits your experience next."
    >
      {publicEnv.NEXT_PUBLIC_API_MODE === "mock" && (
        <div className="integration-notice">
          <Icon name="spark" size={17} />
          <p>
            <strong>You’re in the demo workspace.</strong> Your upload and settings create a new
            demo session. Questions and assessments use a fixed finance example until the interview
            service is connected; they are not generated from your resume yet.
          </p>
        </div>
      )}
      <div className="setup-layout">
        <form onSubmit={submit} className="setup-card">
          <fieldset disabled={busy}>
            <section className="setup-section">
              <h2>First, your resume</h2>
              <p>Give your interviewer a little context about your experience.</p>
              {file ? (
                <div className="file-selected">
                  <Icon name="file" size={28} />
                  <div>
                    <strong>{file.name}</strong>
                    <small>{(file.size / 1024).toFixed(0)} KB · Ready to upload</small>
                  </div>
                  <button type="button" onClick={() => setFile(null)} aria-label="Remove resume">
                    <Icon name="close" size={17} />
                  </button>
                </div>
              ) : (
                <label
                  className={`upload-zone ${dragging ? "dragging" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    choose(e.dataTransfer.files[0]);
                  }}
                >
                  <span className="icon-tile lilac">
                    <Icon name="upload" size={24} />
                  </span>
                  <strong>Drop your resume here, or browse files</strong>
                  <small>PDF, DOCX, or TXT · Up to 10 MB</small>
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    aria-label="Upload resume"
                    onChange={(e) => choose(e.target.files?.[0])}
                  />
                </label>
              )}
            </section>
            <section className="setup-section">
              <h2>What are you preparing for?</h2>
              <p>Choose a role and make room for the experience you want to share.</p>
              <div className="setup-fields">
                <label className="setup-field">
                  Your name
                  <input
                    name="candidate_name"
                    required
                    maxLength={100}
                    placeholder="What should we call you?"
                    autoComplete="given-name"
                  />
                </label>
                <label className="setup-field">
                  Target role
                  <input
                    name="job_title"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    required
                    minLength={2}
                    maxLength={150}
                    placeholder="e.g. Data analyst"
                  />
                </label>
                <label className="setup-field">
                  Experience level
                  <select name="seniority" defaultValue="junior">
                    <option value="intern">Student / intern</option>
                    <option value="junior">Early career</option>
                    <option value="mid">Mid-level</option>
                    <option value="senior">Senior</option>
                    <option value="lead">Team lead</option>
                    <option value="manager">Manager</option>
                  </select>
                </label>
                <label className="setup-field">
                  Interview focus
                  <select name="interview_style" defaultValue="mixed">
                    <option value="mixed">A bit of everything</option>
                    <option value="technical">Technical skills</option>
                    <option value="behavioral">Behavioral questions</option>
                    <option value="case">Case study</option>
                  </select>
                </label>
                <label className="setup-field">
                  Session length
                  <select
                    name="duration_minutes"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  >
                    {[20, 30, 45, 60].map((n) => (
                      <option key={n} value={n}>
                        {n} minutes
                      </option>
                    ))}
                  </select>
                </label>
                <label className="setup-field">
                  Conversation language
                  <select name="interview_language" defaultValue="en-IN">
                    <option value="en-IN">English</option>
                    <option value="hi-IN">Hindi</option>
                  </select>
                </label>
                <label className="setup-field full">
                  Job description <span className="text-ink-muted font-normal">Optional</span>
                  <textarea
                    name="job_description"
                    maxLength={20000}
                    rows={4}
                    placeholder="Paste the job description or the skills you’d like to practice…"
                  />
                  <small>You can start with just your resume and target role.</small>
                </label>
              </div>
            </section>
            {error && (
              <div className="mt-5">
                <Alert tone="bad">{error}</Alert>
              </div>
            )}
            <div className="setup-actions">
              <span>No email. No invitation link. Just you.</span>
              <Button type="submit" loading={busy}>
                {busy ? "Preparing your session" : "Continue to device setup"}
                <Icon name="arrow" size={17} />
              </Button>
            </div>
          </fieldset>
        </form>
        <aside className="setup-summary">
          <span className="icon-tile lilac">
            <Icon name="spark" size={25} />
          </span>
          <h3>Your studio is waiting.</h3>
          <p>A focused space to talk through your work, with the tools you need close by.</p>
          <ul>
            <li>
              <Icon name="mic" size={17} /> Answer by voice or text
            </li>
            <li>
              <Icon name="video" size={17} /> Camera preview
            </li>
            <li>
              <Icon name="screen" size={17} /> Share a screen or window
            </li>
            <li>
              <Icon name="download" size={17} /> Save your session recording
            </li>
          </ul>
          <dl>
            <div>
              <dt>Role</dt>
              <dd>{role || "Your next opportunity"}</dd>
            </div>
            <div>
              <dt>Planned length</dt>
              <dd>{duration} minutes</dd>
            </div>
          </dl>
          <p className="mt-5">
            You’ll review consent and check your devices before the conversation begins.
          </p>
        </aside>
      </div>
    </WorkspaceShell>
  );
}
