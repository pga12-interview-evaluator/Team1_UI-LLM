import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type Tone = "info" | "ok" | "warn" | "bad";

const tones: Record<Tone, string> = {
  info: "border-brand/40 bg-brand-soft text-ink",
  ok: "border-ok/40 bg-ok-soft text-ink",
  warn: "border-warn/40 bg-warn-soft text-ink",
  bad: "border-bad/40 bg-bad-soft text-ink",
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
  live,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  live?: boolean;
}) {
  return (
    <div
      role={tone === "bad" ? "alert" : live ? "status" : undefined}
      className={cn("rounded-lg border px-4 py-3 text-[15px]", tones[tone], className)}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title ? "mt-1" : "")}>{children}</div> : null}
    </div>
  );
}
