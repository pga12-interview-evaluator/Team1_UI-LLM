"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { WorkspaceShell } from "@/features/workspace/WorkspaceShell";
import { deleteRecording, listRecordings, recordingFilename, type SavedRecording } from "./storage";
export function RecordingLibrary() {
  const [items, setItems] = useState<SavedRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    listRecordings()
      .then(setItems)
      .catch(() =>
        setError(
          "This browser could not open your recordings. Allow browser storage and try again.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  async function remove(id: string) {
    try {
      await deleteRecording(id);
      setItems((items) => items.filter((item) => item.id !== id));
    } catch {
      setError("Couldn’t delete this recording. Try again.");
    }
  }
  return (
    <WorkspaceShell
      title="Your conversations, kept close."
      subtitle="Replay a session, reflect on your answers, and see how far you’ve come."
    >
      <div className="integration-notice">
        <Icon name="shield" size={18} />
        <p>
          Saved on this device, in this browser. Download a copy to keep it beyond browser cleanup
          or share it with your reviewer. Recordings are not uploaded to a server.
        </p>
      </div>
      {error && <Alert tone="bad">{error}</Alert>}
      {loading ? (
        <p role="status">Opening your library…</p>
      ) : items.length ? (
        <div className="recording-grid">
          {items.map((item) => (
            <RecordingCard key={item.id} item={item} onDelete={() => remove(item.id)} />
          ))}
        </div>
      ) : (
        !error && (
          <div className="setup-card empty-interviews">
            <span className="empty-orbit">
              <Icon name="video" size={27} />
            </span>
            <h3>A place for your practice</h3>
            <p>
              Allow recording when you start an interview.
              <br />
              Your completed recordings will be saved here.
            </p>
            <Link href="/setup">
              Start an interview <Icon name="arrow" size={17} />
            </Link>
          </div>
        )
      )}
    </WorkspaceShell>
  );
}
function RecordingCard({
  item,
  onDelete,
}: {
  item: SavedRecording;
  onDelete: () => Promise<void>;
}) {
  const [url, setUrl] = useState("");
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const next = URL.createObjectURL(item.blob);
    // A blob URL is an external browser resource, created and revoked with this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [item.blob]);
  return (
    <article className="recording-card">
      <video
        src={url || undefined}
        controls
        preload="metadata"
        playsInline
        aria-label={`${item.title} recording`}
      />
      <h2>{item.title}</h2>
      <p>
        {new Date(item.createdAt).toLocaleString("en-IN")} ·{" "}
        {Math.max(1, Math.round(item.durationSeconds / 60))} min ·{" "}
        {(item.blob.size / 1024 / 1024).toFixed(1)} MB
      </p>
      <div className="recording-actions">
        <a href={url} download={recordingFilename(item)} className="action-link">
          <Icon name="download" size={16} /> Download
        </a>
        <Button variant="ghost" onClick={() => setConfirm(true)}>
          Delete
        </Button>
      </div>
      {confirm && (
        <div className="mt-3">
          <p>Delete this recording from this browser?</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="danger" onClick={onDelete}>
              Delete recording
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
