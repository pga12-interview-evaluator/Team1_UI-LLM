export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return "–";
  const whole = Math.floor(minutes);
  const secs = Math.round((minutes - whole) * 60);
  return secs === 0 ? `${whole} min` : `${whole} min ${secs}s`;
}

export function formatDateTime(iso: string | null | undefined, locale = "en-IN"): string {
  if (!iso) return "–";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
