import styles from './Icon.module.css';

/**
 * Lucide icon geometry with Animate UI's interaction model — icons react when
 * the control containing them is hovered or becomes active.
 *
 * Animate UI itself installs through the shadcn CLI and ships Tailwind-classed
 * components built on Motion. This codebase has neither Tailwind nor shadcn,
 * and the animations it uses for icons (a 2px nudge, a rotation, a draw-on
 * check) are all reachable with CSS transitions — so the same effect lands
 * here without a third styling system or a ~50kb animation runtime.
 *
 * Usage:
 *   <Icon name="send" />                     // animates on ancestor hover
 *   <Icon name="check" size={14} active />   // animates on state
 *   <Icon name="refresh" spin />             // continuous
 */

const PATHS = {
  // ── Status / time ──────────────────────────────────────────────
  clock:      <><circle cx="12" cy="12" r="9" /><path className="hand" d="M12 7v5l3 2" /></>,
  alert:      <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  check:      <path className="draw" d="M20 6 9 17l-5-5" />,
  checkCircle:<><circle cx="12" cy="12" r="9" /><path className="draw" d="M8.5 12.5 11 15l4.5-5" /></>,

  // ── People ─────────────────────────────────────────────────────
  user:       <><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></>,
  userPlus:   <><circle cx="10" cy="8" r="4" /><path d="M2 20c0-4 3.6-7 8-7 1 0 2 .2 2.9.5" /><path className="plusV" d="M19 14v6" /><path className="plusH" d="M16 17h6" /></>,

  // ── Composer ───────────────────────────────────────────────────
  send:       <><path className="fly" d="M22 2 11 13" /><path className="fly" d="M22 2l-7 20-4-9-9-4 20-7z" /></>,
  paperclip:  <path className="tilt" d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />,
  sparkles:   <><path className="twinkle" d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3Z" /><path className="twinkle2" d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" /></>,
  note:       <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path className="tilt" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></>,
  lock:       <><rect x="4" y="10" width="16" height="11" rx="2" /><path className="shackle" d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  link:       <><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></>,

  // ── Objects ────────────────────────────────────────────────────
  tag:        <><path d="M20.6 13.4 12 4.8H4v8l8.6 8.6a2 2 0 0 0 2.8 0l5.2-5.2a2 2 0 0 0 0-2.8Z" /><circle cx="7.5" cy="8.5" r="1.2" /></>,
  package:    <><path d="m7.5 4.3 9 5.2" /><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="M3.3 7 12 12l8.7-5" /><path d="M12 22V12" /></>,
  history:    <><path d="M3 7v6h6" /><path className="spinPart" d="M3 13a9 9 0 1 0 3-7.7L3 8" /><path className="hand" d="M12 8v4l3 2" /></>,
  refresh:    <><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></>,
  copy:       <><rect x="8" y="8" width="14" height="14" rx="2" /><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2" /></>,

  // ── Chrome ─────────────────────────────────────────────────────
  chevron:    <path d="M6 9l6 6 6-6" />,
  plus:       <><path className="plusV" d="M12 5v14" /><path className="plusH" d="M5 12h14" /></>,
  close:      <><path className="x1" d="M18 6 6 18" /><path className="x2" d="m6 6 12 12" /></>,
  panel:      <><rect x="3" y="4" width="18" height="16" rx="2" /><path className="divider" d="M15 4v16" /></>,
};

export default function Icon({
  name,
  size = 16,
  strokeWidth = 1.9,
  spin = false,
  active = false,
  className = '',
  ...rest
}) {
  const glyph = PATHS[name];
  if (!glyph) {
    if (import.meta.env.DEV) console.warn(`<Icon name="${name}"> is not in the set`);
    return null;
  }

  return (
    <svg
      className={`${styles.icon} ${spin ? styles.spin : ''} ${active ? styles.active : ''} ${className}`}
      data-icon={name}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {glyph}
    </svg>
  );
}
