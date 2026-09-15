import type { CSSProperties } from "react";
const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  video: "M3 5h12v14H3z m12 5 6-4v12l-6-4",
  mic: "M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0V4 M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8",
  screen: "M3 4h18v13H3z M8 21h8 M12 17v4",
  file: "M14 2H5v20h14V7l-5-5v5h5 M8 12h8 M8 16h6",
  chart: "M4 3v17h17 M8 15v-4 M13 15V7 M18 15V4",
  play: "m9 5 11 7-11 7V5Z",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2",
  check: "m5 12 4 4L19 6",
  upload: "M12 16V3m-5 5 5-5 5 5 M4 15v6h16v-6",
  download: "M12 3v13m-5-5 5 5 5-5 M4 16v5h16v-5",
  book: "M12 5Q7 2 2 4v15q5-2 10 1 5-3 10-1V4q-5-2-10 1v15",
  help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5 M12 17h.01",
  shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z m-4 10 3 3 5-6",
  plus: "M12 5v14 M5 12h14",
  close: "m6 6 12 12 M6 18 18 6",
  folder: "M3 5h7l2 3h9v12H3V5Z",
  settings: "M4 7h16 M4 17h16 M8 4v6 M16 14v6",
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 20,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
