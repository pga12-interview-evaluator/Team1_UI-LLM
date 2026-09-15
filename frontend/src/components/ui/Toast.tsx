"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils/cn";

type Tone = "ok" | "info" | "warn" | "bad";
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
}

const ToastContext = createContext<{ push: (toast: Omit<Toast, "id">) => void }>({
  push: () => {},
});

const tones: Record<Tone, string> = {
  ok: "border-ok/40 bg-ok-soft",
  info: "border-brand/40 bg-brand-soft",
  warn: "border-warn/40 bg-warn-soft",
  bad: "border-bad/40 bg-bad-soft",
};

/** Lightweight, accessible toasts. Bottom-right on desktop, bottom on mobile; auto-dismiss 5 s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const counter = useRef(0);
  const push = useCallback((toast: Omit<Toast, "id">) => {
    const id = ++counter.current;
    setItems((list) => [...list, { ...toast, id }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 5000);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4"
      >
        {items.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              "animate-scale-in shadow-lift pointer-events-auto w-full max-w-sm rounded-xl border px-4 py-3 text-sm",
              tones[toast.tone],
            )}
          >
            <p className="text-ink font-semibold">{toast.title}</p>
            {toast.body ? <p className="text-ink-muted mt-0.5 break-words">{toast.body}</p> : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
