"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Native <dialog>-based modal: focus trap, Escape, backdrop and inert background come from the platform. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={cn(
        "rounded-card border-line bg-surface text-ink shadow-card m-auto w-[min(92vw,34rem)] border p-0 backdrop:bg-black/50",
        className,
      )}
    >
      <div className="px-6 pt-6">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {description ? (
          <p id={descId} className="text-ink-muted mt-2 text-[15px]">
            {description}
          </p>
        ) : null}
      </div>
      <div className="px-6 py-4">{children}</div>
      {footer ? (
        <div className="border-line flex flex-wrap justify-end gap-2 border-t px-6 py-4">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}
