/** Small stroke icons, drawn inline so the app ships no icon font or sprite. */
const PATHS: Record<string, string> = {
  pan: "M8 3v10M3 8h10M8 3l-2 2M8 3l2 2M8 13l-2-2M8 13l2-2M3 8l2-2M3 8l2 2M13 8l-2-2M13 8l-2 2",
  identify: "M8 2.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11M8 7v4M8 5v.5",
  point: "M8 4.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7",
  line: "M2.5 12.5L6 6l4 4 3.5-6.5",
  polygon: "M3 5l5-2.5 5 3-1 6.5H4z",
  edit: "M3 13l1-3.5L10.5 3 13 5.5 6.5 12zM9.5 4l2.5 2.5",
  "measure-line": "M2 10.5l8.5-8.5 3.5 3.5L5.5 14zM5 9.5l1 1M7 7.5l1.5 1.5M9 5.5l1 1",
  "measure-area": "M2.5 2.5h11v11h-11zM2.5 7h3M10.5 13.5v-3",
  profile: "M1.5 13l4-6 3 3 3-6 3 4M1.5 13.5h13",
  undo: "M5 4L2 7l3 3M2 7h7.5a3.5 3.5 0 0 1 0 7H7",
  redo: "M11 4l3 3-3 3M14 7H6.5a3.5 3.5 0 0 0 0 7H9",
  eye: "M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3",
  up: "M8 3.5v9M4.5 7L8 3.5 11.5 7",
  down: "M8 12.5v-9M4.5 9L8 12.5 11.5 9",
  trash: "M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.75 9h5.5l.75-9",
  zoom: "M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 1 0 0-9M10.5 10.5L14 14M5 7h4M7 5v4",
  table: "M2 3h12v10H2zM2 6.5h12M2 10h12M6 3v10",
  globe: "M8 1.75a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 1 0 0-12.5M1.75 8h12.5M8 1.75c2 2 2 10.5 0 12.5M8 1.75c-2 2-2 10.5 0 12.5",
  magnet: "M4 2.5v5a4 4 0 0 0 8 0v-5M4 2.5h2.5v5a1.5 1.5 0 0 0 3 0v-5H12M4 5h2.5M9.5 5H12",
  plus: "M8 3v10M3 8h10",
  layers: "M8 2l6 3.5-6 3.5-6-3.5zM2 8.5L8 12l6-3.5M2 11.5L8 15l6-3.5",
};

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}
