import { clsx, type ClassValue } from "clsx";

/** Tailwind-friendly class joiner. Later classes win only when they are different utilities; keep variants explicit. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
