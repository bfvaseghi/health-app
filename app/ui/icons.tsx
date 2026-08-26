import { ReactNode } from "react";

const paths: Record<string, ReactNode> = {
  pulse: <path d="M3 12h4l2-6 4 12 2-6h6" />,
  today: (
    <>
      <path d="M4 5h16v14H4z" />
      <path d="M8 9h8M8 13h5" />
    </>
  ),
  fitness: (
    <>
      <path d="M4 9v6M20 9v6M7 7v10M17 7v10" />
      <path d="M7 12h10" />
    </>
  ),
  overview: (
    <>
      <path d="M4 5h16v14H4z" />
      <path d="M8 9h8M8 13h5" />
    </>
  ),
  sleep: <path d="M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5Z" />,
  moon: <path d="M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5Z" />,
  records: (
    <>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M14 3v4h4M9 11h6M9 15h6" />
    </>
  ),
  summary: (
    <>
      <path d="M7 3h10a2 2 0 0 1 2 2v16l-3-2-2 2-2-2-2 2-2-2-3 2V5a2 2 0 0 1 2-2Z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  body: (
    <>
      <circle cx="12" cy="5" r="2.4" />
      <path d="M5 10h14M12 10v5M12 15l-3 6M12 15l3 6" />
    </>
  ),
  labs: (
    <>
      <path d="M10 3h4M11 3v6.5L6.5 18a2 2 0 0 0 1.8 3h7.4a2 2 0 0 0 1.8-3L13 9.5V3" />
      <path d="M8.6 14h6.8" />
    </>
  ),
  lifting: (
    <>
      <path d="M4 9v6M20 9v6M7 7v10M17 7v10" />
      <path d="M7 12h10" />
    </>
  ),
  dumbbell: (
    <>
      <path d="M4 9v6M20 9v6M7 7v10M17 7v10" />
      <path d="M7 12h10" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
      <path d="M10 19h4M12 14v5M8 21h8" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.4" />
    </>
  ),
  mind: (
    <>
      <path d="M12 4a4 4 0 0 0-4 4 3 3 0 0 0-1 5.8V16a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3v-2.2A3 3 0 0 0 16 8a4 4 0 0 0-4-4Z" />
      <path d="M12 8v6" />
    </>
  ),
  journal: (
    <>
      <path d="M6 4h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      <path d="M8 4v18M11 9h5M11 13h5" />
    </>
  ),
  fuel: (
    <>
      <path d="M6 21V8a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3v13" />
      <path d="M6 12h8M17 9l2 2v7a2 2 0 0 1-4 0" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5L9 6.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L5 11a7 7 0 0 0 0 2l-2.1 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.5 3.1h5l.5-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4L19 13a7 7 0 0 0 .1-1Z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  medication: (
    <>
      <path d="m7 17 10-10a3 3 0 1 0-4-4L3 13a3 3 0 0 0 4 4Z" />
      <path d="m9 7 8 8" />
    </>
  ),
  weight: (
    <>
      <path d="M5 5h14l2 16H3L5 5Z" />
      <path d="M9 9a3 3 0 0 1 6 0" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  alert: (
    <>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  spark: <path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z" />,
  arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
  download: <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  copy: (
    <>
      <rect x="8" y="8" width="11" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4 6v6c0 5 3 8 8 10 5-2 8-5 8-10V6l-8-3Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  pencil: (
    <>
      <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7h12l-1 13H7L6 7Z" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  printer: (
    <>
      <path d="M7 9V3h10v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M7 15h10v6H7z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5" />
    </>
  ),
  history: (
    <>
      <path d="M4 12a8 8 0 1 0 2.6-5.9L4 8" />
      <path d="M4 4v4h4" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  chevron: <path d="m9 6 6 6-6 6" />,
  keyboard: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
    </>
  ),
  undo: (
    <>
      <path d="M4 9h11a5 5 0 0 1 0 10h-6" />
      <path d="M8 5 4 9l4 4" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 10v10" />
    </>
  ),
};

export function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name] ?? paths.spark}
    </svg>
  );
}
