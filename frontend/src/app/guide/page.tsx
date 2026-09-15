import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { WorkspaceShell } from "@/features/workspace/WorkspaceShell";
const sections: { icon: IconName; title: string; items: string[] }[] = [
  {
    icon: "file",
    title: "Bring a little context",
    items: [
      "Use your latest resume as a PDF, DOCX, or text file, up to 10 MB.",
      "Pick a target role and add a job description if you have one.",
      "Think of a project where you can explain your own contribution and the outcome.",
    ],
  },
  {
    icon: "mic",
    title: "Settle into your space",
    items: [
      "Choose a quiet spot and use headphones to reduce echo.",
      "Allow your microphone and camera when the browser asks. You can also answer by typing.",
      "Use a current desktop browser for screen sharing. Camera and screen access need HTTPS or localhost.",
    ],
  },
  {
    icon: "screen",
    title: "Know your studio",
    items: [
      "Choose Share screen to select a tab, window, or display. Only the surface you select is shared.",
      "When you allow recording, recording begins during the interview once your devices are ready. It includes your microphone, camera and shared screen when available.",
      "You can stop sharing, pause recording, request a break, repeat a question, or switch to text.",
    ],
  },
  {
    icon: "video",
    title: "Keep your conversation",
    items: [
      "Recordings are saved in this browser after you finish or stop recording. Keep the tab open until saving finishes.",
      "Open Recordings to play or download a copy. Clearing browser data removes local recordings, so download anything you want to keep.",
      "Screen or tab audio and the browser’s read-aloud voice are not included. The recording captures your microphone; assessment reports live in Review & insights.",
    ],
  },
];
export default function GuidePage() {
  return (
    <WorkspaceShell
      title="A little preparation goes a long way."
      subtitle="Everything you need for a calm, focused conversation."
    >
      <div className="guide-grid">
        {sections.map((s) => (
          <article key={s.title}>
            <span className="icon-tile lilac">
              <Icon name={s.icon} size={24} />
            </span>
            <h2>{s.title}</h2>
            <ul>
              {s.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <Link href="/setup" className="action-link mt-7">
        I’m ready to practice <Icon name="arrow" size={17} />
      </Link>
    </WorkspaceShell>
  );
}
