import type { TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export function Table({ className, ...rest }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="rounded-card border-line max-w-full min-w-0 overflow-x-auto border">
      <table
        className={cn(
          "[&_tbody_tr:hover]:bg-surface-2/70 w-full min-w-[640px] border-collapse text-sm [&_tbody_tr]:transition-colors",
          className,
        )}
        {...rest}
      />
    </div>
  );
}

export function Th({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        "bg-surface-2 text-ink px-3 py-2 text-left font-semibold whitespace-nowrap",
        className,
      )}
      {...rest}
    />
  );
}

export function Td({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("border-line text-ink border-t px-3 py-2 align-top", className)} {...rest} />
  );
}
