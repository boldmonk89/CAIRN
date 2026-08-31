"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { Activity, Home, Medal, Play, User } from "./icons";

export function Stat({
  label, value, unit, size = "md",
}: { label: string; value: ReactNode; unit?: string; size?: "sm" | "md" | "lg" | "hero" }) {
  const scale = {
    sm: "text-lg", md: "text-2xl", lg: "text-4xl",
    hero: "text-[clamp(3rem,18vw,5.5rem)]",
  }[size];
  return (
    <div className="min-w-0">
      <p className="label text-muted">{label}</p>
      <p className={`stat ${scale} font-medium leading-none mt-1 truncate`}>
        {value}
        {unit && <span className="ml-1 text-[0.5em] text-muted">{unit}</span>}
      </p>
    </div>
  );
}

export function Card({
  children, className = "", as: As = "div",
}: { children: ReactNode; className?: string; as?: "div" | "li" | "section" }) {
  return <As className={`rounded-xl border border-line bg-card ${className}`}>{children}</As>;
}

export function Button({
  children, variant = "primary", className = "", ...props
}: {
  children: ReactNode;
  variant?: "primary" | "ghost" | "danger";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary: "bg-accent text-accent-ink hover:brightness-110",
    ghost: "border border-line bg-raised text-ink hover:border-muted",
    danger: "border border-line bg-raised text-bad hover:border-bad",
  }[variant];
  return (
    <button
      type="button"
      {...props}
      className={`min-h-12 cursor-pointer rounded-xl px-5 font-semibold transition-[filter,border-color] duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

/** Bottom sheet on a native <dialog>: Escape, focus trap and inert background
 *  come from the platform, so there's nothing here to get wrong. */
export function Sheet({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-label={title}
      className="m-0 mt-auto max-h-[90dvh] w-full max-w-[560px] rounded-t-3xl border border-line bg-card p-0 text-ink backdrop:bg-black/70 sm:mx-auto"
    >
      <div className="flex max-h-[90dvh] flex-col">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h2 className="display flex-1 text-xl">{title}</h2>
          <button
            type="button" onClick={onClose} aria-label="Close"
            className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-muted hover:bg-raised hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain p-4">{children}</div>
      </div>
    </dialog>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="display text-2xl">{title}</p>
      <p className="mx-auto mt-2 max-w-[38ch] text-sm text-muted">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-2 block text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full min-h-12 rounded-xl border border-line bg-raised px-3 text-base text-ink placeholder:text-muted focus:border-accent";

// Five slots, evenly spaced. Measured off the references: two of them read as
// four clusters offset by one position, which is the same bar with a different
// item lit — the implied spacing puts slots at 10/30/49/69/89% of the width.
const TABS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/activities", label: "Runs", Icon: Activity },
  { href: "/record", label: "Record", Icon: Play, center: true },
  { href: "/records", label: "Medals", Icon: Medal },
  { href: "/you", label: "You", Icon: User },
] as const;

export function TabBar() {
  const path = usePathname();
  // The recorder owns the whole screen — a nav bar there is one mis-tap away
  // from ending someone's run.
  if (path === "/record") return null;

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ground/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-[560px] items-center">
        {TABS.map(({ href, label, Icon, ...rest }) => {
          const center = "center" in rest && rest.center;
          // exact match, or a real sub-path: startsWith would light both
          // "Record" and "Medals" when you are on /records
          const active = path === href || (href !== "/" && path.startsWith(href + "/"));
          if (center) {
            return (
              <li key={label} className="flex-1">
                <Link
                  href={href}
                  className="mx-auto my-2 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-accent text-accent-ink transition-[filter] duration-200 hover:brightness-110"
                >
                  <Icon size={24} />
                  <span className="sr-only">{label}</span>
                </Link>
              </li>
            );
          }
          return (
            <li key={label} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[60px] cursor-pointer flex-col items-center justify-center gap-1 transition-colors duration-200 ${
                  active ? "text-accent" : "text-muted hover:text-ink"
                }`}
              >
                <Icon size={21} />
                <span className="label text-[10px]">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
