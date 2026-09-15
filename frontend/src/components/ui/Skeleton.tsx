import { cn } from "@/lib/utils/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("bg-surface-2 animate-pulse rounded-md", className)} />;
}
