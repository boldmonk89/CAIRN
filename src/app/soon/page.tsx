"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Empty } from "@/components/ui";

const PHASE: Record<string, string> = {
  Map: "Phase 2 — stops, the drawn route, and everyone's live position while the app is open.",
  Plan: "Phase 3 — itinerary suggestions, places, distances and weather per stop.",
  Stays: "Phase 4 — search accommodation and deep-link out to book.",
  Profile: "Lands with real accounts, once auth is wired up.",
};

function Soon() {
  const tab = useSearchParams().get("tab") ?? "This";
  return (
    <>
      <header className="px-5 pb-2 pt-8">
        <h1 className="text-[26px] font-bold tracking-tight">{tab}</h1>
      </header>
      <Empty icon="⛰️" title="Not built yet" body={PHASE[tab] ?? "Coming later."} />
    </>
  );
}

export default function Page() {
  return <Suspense><Soon /></Suspense>;
}
