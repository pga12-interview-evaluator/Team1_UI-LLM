"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

export function Tabs({ items, initial }: { items: TabItem[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? items[0]?.id);
  const baseId = useId();

  const move = (delta: number) => {
    const index = items.findIndex((item) => item.id === active);
    const next = items[(index + delta + items.length) % items.length];
    if (next) setActive(next.id);
  };

  return (
    <div>
      <div role="tablist" className="border-line flex flex-wrap gap-1 border-b">
        {items.map((item) => {
          const selected = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(item.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") move(1);
                if (event.key === "ArrowLeft") move(-1);
              }}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                selected
                  ? "border-brand text-brand"
                  : "text-ink-muted hover:text-ink border-transparent",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== active}
          className="pt-4"
        >
          {item.id === active ? item.content : null}
        </div>
      ))}
    </div>
  );
}
