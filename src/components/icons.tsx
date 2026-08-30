// Inline stroke icons. Emoji are not icons — they render differently on every
// platform, can't take currentColor, and are read aloud by screen readers.
// A dozen SVG paths beat a dependency for this.

type P = { size?: number; className?: string; strokeWidth?: number };

const Svg = ({ size = 22, className = "", strokeWidth = 1.8, children }: P & { children: React.ReactNode }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={strokeWidth}
    strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden focusable="false"
  >
    {children}
  </svg>
);

export const Home = (p: P) => (
  <Svg {...p}><path d="M4 11l8-7 8 7v8a1 1 0 01-1 1h-4v-6H9v6H5a1 1 0 01-1-1z" /></Svg>
);
export const Activity = (p: P) => (
  <Svg {...p}><path d="M3 12h4l3 8 4-16 3 8h4" /></Svg>
);
export const Play = (p: P) => (
  <Svg {...p}><path d="M7 4.5l12 7.5-12 7.5z" /></Svg>
);
export const Pause = (p: P) => (
  <Svg {...p}><path d="M9 5v14M15 5v14" strokeWidth={2.4} /></Svg>
);
export const Stop = (p: P) => (
  <Svg {...p}><rect x="6" y="6" width="12" height="12" rx="2" /></Svg>
);
export const User = (p: P) => (
  <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></Svg>
);
export const Medal = (p: P) => (
  <Svg {...p}><circle cx="12" cy="15" r="6" /><path d="M8.5 9.5L6 3h12l-2.5 6.5M12 12.5l1 2 2 .3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1L9 14.8l2-.3z" /></Svg>
);
export const Share = (p: P) => (
  <Svg {...p}><path d="M12 3v13M8 7l4-4 4 4M5 14v5a1 1 0 001 1h12a1 1 0 001-1v-5" /></Svg>
);
export const Download = (p: P) => (
  <Svg {...p}><path d="M12 16V3M8 12l4 4 4-4M5 15v4a1 1 0 001 1h12a1 1 0 001-1v-4" /></Svg>
);
export const Trash = (p: P) => (
  <Svg {...p}><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></Svg>
);
export const Back = (p: P) => (
  <Svg {...p}><path d="M15 5l-7 7 7 7" strokeWidth={2} /></Svg>
);
export const Mountain = (p: P) => (
  <Svg {...p}><path d="M3 19l6-11 4 7 2-3 6 7z" /></Svg>
);
export const Flame = (p: P) => (
  <Svg {...p}><path d="M12 3s5 4.5 5 9a5 5 0 01-10 0c0-1.5.6-2.8 1.4-3.8.3 1.2 1 2 1.9 2.3C10.6 8.4 12 6 12 3z" /></Svg>
);
export const Clock = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Svg>
);
export const Ruler = (p: P) => (
  <Svg {...p}><path d="M3 15L15 3l6 6L9 21z M7 11l2 2M10 8l2 2M13 5l2 2" /></Svg>
);
export const Warning = (p: P) => (
  <Svg {...p}><path d="M12 4l9 16H3zM12 10v4M12 17.5v.5" /></Svg>
);
export const Satellite = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="2.5" /><path d="M12 5a7 7 0 017 7M12 2a10 10 0 0110 10M12 19a7 7 0 01-7-7M12 22A10 10 0 012 12" /></Svg>
);
