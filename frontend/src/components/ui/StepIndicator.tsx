import { cn } from "@/lib/utils/cn";

/** Pre-interview steps only (consent → setup → begin). Never used inside the interview itself. */
export function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mx-auto mb-6 flex w-full max-w-2xl items-center gap-2" aria-label="Progress">
      {steps.map((step, index) => {
        const state = index < current ? "done" : index === current ? "current" : "todo";
        return (
          <li
            key={step}
            className="flex flex-1 items-center gap-2"
            aria-current={state === "current" ? "step" : undefined}
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                state === "done" && "border-brand bg-brand text-brand-ink",
                state === "current" && "border-brand text-brand bg-surface",
                state === "todo" && "border-line text-ink-muted bg-surface",
              )}
            >
              {state === "done" ? "✓" : index + 1}
            </span>
            <span
              className={cn(
                "hidden text-sm sm:inline",
                state === "current" ? "text-ink font-medium" : "text-ink-muted",
              )}
            >
              {step}
            </span>
            {index < steps.length - 1 ? (
              <span
                className={cn("h-px flex-1", index < current ? "bg-brand" : "bg-line")}
                aria-hidden
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
