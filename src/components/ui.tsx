"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { formatMoney, type Minor } from "@/lib/money";
import type { Member } from "@/lib/store";

export const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export function Avatar({ member, size = 32 }: { member: Member; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-grid place-items-center rounded-full font-semibold text-white shrink-0"
      style={{
        width: size, height: size, fontSize: size * 0.38,
        // 42% lightness keeps white text above 4.5:1 at every hue we seed
        background: `hsl(${member.hue} 55% 42%)`,
      }}
    >
      {initials(member.name)}
    </span>
  );
}

export function AvatarStack({ members, max = 4 }: { members: Member[]; max?: number }) {
  const shown = members.slice(0, max);
  const rest = members.length - shown.length;
  return (
    <div className="flex items-center">
      <span className="sr-only">{members.map((m) => m.name).join(", ")}</span>
      {shown.map((m, i) => (
        <span key={m.id} className="rounded-full ring-2 ring-card" style={{ marginLeft: i ? -8 : 0 }}>
          <Avatar member={m} size={26} />
        </span>
      ))}
      {rest > 0 && (
        <span
          aria-hidden
          className="grid h-[26px] w-[26px] place-items-center rounded-full bg-line text-[10px] font-semibold text-muted ring-2 ring-card"
          style={{ marginLeft: -8 }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

/** Money with a sign-aware colour. `neutral` when the sign carries no meaning. */
export function Amount({
  minor, currency, tone = "signed", className = "",
}: { minor: Minor; currency: string; tone?: "signed" | "neutral"; className?: string }) {
  const colour =
    tone === "neutral" ? "" : minor > 0n ? "text-good" : minor < 0n ? "text-bad" : "text-muted";
  return (
    <span className={`tabular-nums ${colour} ${className}`}>
      {formatMoney(minor < 0n && tone === "signed" ? -minor : minor, currency)}
    </span>
  );
}

export function Chip({
  children, active, ...props
}: { children: ReactNode; active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...props}
      className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors ${
        active
          ? "border-ink bg-ink text-white"
          : "border-line bg-card text-ink hover:border-muted"
      } ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-line bg-card ${className}`}>{children}</div>
  );
}

/**
 * Bottom sheet on a native <dialog>: Escape, focus trapping and an inert
 * background all come from the platform. Nothing to reimplement.
 */
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
      className="m-0 mt-auto max-h-[88dvh] w-full max-w-[520px] rounded-t-3xl bg-card p-0 text-ink backdrop:bg-black/40 sm:mx-auto sm:mb-0"
    >
      <div className="flex max-h-[88dvh] flex-col">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-card px-4 py-3 rounded-t-3xl">
          <h2 className="flex-1 text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-11 w-11 place-items-center rounded-full hover:bg-bg"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-4 pb-6 pt-4">{children}</div>
      </div>
    </dialog>
  );
}

export function Field({
  label, hint, children,
}: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full min-h-11 rounded-xl border border-line bg-card px-3 text-base text-ink " +
  "placeholder:text-muted focus:border-ink";

const TABS = [
  { href: "/", label: "Trips", d: "M3 7h18M3 12h18M3 17h18" },
  { href: "/soon?tab=Map", label: "Map", d: "M9 4L3 7v13l6-3 6 3 6-3V4l-6 3-6-3z" },
  { href: "/soon?tab=Plan", label: "Plan", d: "M12 3v18M3 12h18" },
  { href: "/soon?tab=Stays", label: "Stays", d: "M4 21V10l8-6 8 6v11H4z" },
  { href: "/soon?tab=Profile", label: "Profile", d: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0" },
] as const;

export function TabBar() {
  const path = usePathname();
  return (
    // fixed height, and nothing here listens to scroll: the bar can never
    // resize and shove the content it sits over
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-[520px]">
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href.split("?")[0]);
          return (
            <li key={t.label} className="flex-1">
              <Link
                href={t.href as never}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d={t.d} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Empty({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="px-6 py-14 text-center">
      <div aria-hidden className="mb-3 text-4xl">{icon}</div>
      <p className="font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-[36ch] text-sm text-muted">{body}</p>
    </div>
  );
}
