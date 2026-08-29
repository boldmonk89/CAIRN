"use client";

import Link from "next/link";
import { useState } from "react";
import { Amount, AvatarStack, Card, Chip, Empty } from "@/components/ui";
import { useOverallBalance, useTripSummaries, type TripSummary } from "@/lib/store";

const COVERS: Record<string, string> = {
  t1: "linear-gradient(150deg,#2f5d50,#7ba05b 55%,#d9c98b)",
  t2: "linear-gradient(150deg,#243b6b,#7a4a86 60%,#e0736a)",
};
const coverFor = (id: string) =>
  COVERS[id] ?? "linear-gradient(150deg,#3a3f5c,#6b7aa1 60%,#c9a27e)";

const dateRange = (from: string, to: string) => {
  const f = new Date(from), t = new Date(to);
  const month = (d: Date) => d.toLocaleDateString("en-IN", { month: "short" });
  const sameMonth = f.getMonth() === t.getMonth() && f.getFullYear() === t.getFullYear();
  return sameMonth
    ? `${month(f)} ${f.getDate()}–${t.getDate()}`
    : `${month(f)} ${f.getDate()} – ${month(t)} ${t.getDate()}`;
};

function TripCard({ summary }: { summary: TripSummary }) {
  const { trip, mine, expenseCount, pendingForMe } = summary;
  return (
    <li>
      <Link href={`/trips/${trip.id}`} className="block rounded-card focus-visible:outline-offset-4">
        <div
          className="relative aspect-[4/3] w-full overflow-hidden rounded-card"
          style={{ background: coverFor(trip.id) }}
        >
          <span className="absolute left-3 top-3 rounded-full bg-card/95 px-2.5 py-1 text-[11px] font-semibold">
            {trip.currency}
          </span>
          {pendingForMe > 0 && (
            <span className="absolute right-3 top-3 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-white">
              {pendingForMe} to confirm
            </span>
          )}
          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
            <AvatarStack members={trip.members} />
            <span className="rounded-full bg-card/95 px-2.5 py-1 text-[11px] font-medium text-muted">
              {expenseCount} {expenseCount === 1 ? "expense" : "expenses"}
            </span>
          </div>
        </div>

        <div className="px-0.5 pt-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="truncate font-semibold">{trip.name}</h3>
            <span className="shrink-0 text-sm text-muted">{dateRange(trip.from, trip.to)}</span>
          </div>
          <p className="truncate text-sm text-muted">{trip.place}</p>
          <p className="mt-1 text-sm">
            {mine.length === 0 ? (
              <span className="text-muted">All settled up</span>
            ) : (
              mine.map((b) => (
                <span key={b.currency} className="mr-3 whitespace-nowrap">
                  <span className="text-muted">{b.amount > 0n ? "you're owed " : "you owe "}</span>
                  <Amount minor={b.amount} currency={b.currency} className="font-semibold" />
                </span>
              ))
            )}
          </p>
        </div>
      </Link>
    </li>
  );
}

const FILTERS = {
  All: () => true,
  "Owed to you": (s: TripSummary) => s.mine.some((b) => b.amount > 0n),
  "You owe": (s: TripSummary) => s.mine.some((b) => b.amount < 0n),
  "Settled up": (s: TripSummary) => s.mine.length === 0,
} as const;

export default function Home() {
  const summaries = useTripSummaries();
  const overall = useOverallBalance();
  const [filter, setFilter] = useState<keyof typeof FILTERS>("All");
  const visible = summaries.filter(FILTERS[filter]);

  return (
    <>
      {/* Fixed height, and nothing in here listens to scroll — so it cannot
          resize mid-scroll and shove the list underneath it. */}
      <header className="sticky top-0 z-10 bg-bg/95 px-5 pb-3 pt-4 backdrop-blur">
        <Link
          href="/soon?tab=Plan"
          className="flex min-h-12 items-center gap-3 rounded-full border border-line bg-card px-5 shadow-sm"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="font-semibold">Start your search</span>
        </Link>

        <div className="rail -mx-5 mt-3 flex gap-2 px-5">
          {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>{f}</Chip>
          ))}
        </div>
      </header>

      <div className="px-5 pt-1">
        {overall.length > 0 && (
          <Card className="mb-6 p-4">
            <p className="text-sm text-muted">Across all your trips</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-1">
              {overall.map((b) => (
                <p key={b.currency} className="text-xl font-bold">
                  <Amount minor={b.amount} currency={b.currency} />
                  <span className="ml-1.5 text-sm font-medium text-muted">
                    {b.amount > 0n ? "owed to you" : "you owe"}
                  </span>
                </p>
              ))}
            </div>
          </Card>
        )}

        <h2 className="mb-3 text-[22px] font-bold tracking-tight">Your trips</h2>

        {visible.length === 0 ? (
          <Empty
            icon="🧭"
            title={filter === "All" ? "No trips yet" : `Nothing under “${filter}”`}
            body={
              filter === "All"
                ? "Start one and invite the people coming with you."
                : "Try another filter."
            }
          />
        ) : (
          <ul className="grid gap-7 pb-6">
            {visible.map((s) => <TripCard key={s.trip.id} summary={s} />)}
          </ul>
        )}
      </div>
    </>
  );
}
