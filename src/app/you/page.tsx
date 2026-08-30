"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, Empty, Field, Stat, inputClass } from "@/components/ui";
import { Flame, Medal, Mountain } from "@/components/icons";
import { useProfile, useRuns } from "@/lib/db";
import { personalBests, totals } from "@/lib/runs";
import { duration, km } from "@/lib/format";

const PB_KM: Record<string, number> = { "1K": 1, "5K": 5, "10K": 10, Half: 21.0975, Marathon: 42.195 };

export default function YouPage() {
  const { runs, error } = useRuns();
  const { profile, save } = useProfile();
  const [weightText, setWeightText] = useState("");

  if (error) return <Empty title="Can't read your runs" body={error} />;
  if (!runs) return <div className="p-5 label text-muted">Loading…</div>;

  const all = totals(runs);
  const pbs = personalBests(runs);
  const weight = Number(weightText === "" ? profile.weightKg : weightText);
  const weightValid = Number.isFinite(weight) && weight >= 25 && weight <= 250;

  return (
    <div className="px-5 pb-32 pt-8">
      <p className="label text-muted">Profile</p>
      <h1 className="display mt-2 text-[clamp(2.5rem,12vw,3.5rem)]">{profile.name}</h1>

      <Card className="mt-7 p-5">
        <p className="label text-muted">All time</p>
        <div className="mt-3 grid grid-cols-2 gap-5">
          <Stat label="Distance" value={km(all.distance, 1)} unit="km" size="lg" />
          <Stat label="Runs" value={all.runs} size="lg" />
          <Stat label="Moving time" value={duration(all.movingMs)} />
          <Stat label="Calories" value={all.calories.toLocaleString()} unit="kcal" />
        </div>
        {all.elevation >= 10 && (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted">
            <Mountain size={16} /> {Math.round(all.elevation).toLocaleString()} m climbed
          </p>
        )}
      </Card>

      <section className="mt-9">
        <div className="mb-3 flex items-center gap-2">
          <Medal size={18} className="text-gold" />
          <h2 className="display text-xl">Records</h2>
        </div>
        {pbs.length === 0 ? (
          <Empty title="No records yet" body="Records appear once you've run far enough to set one." />
        ) : (
          <Card className="divide-y divide-line">
            {pbs.map((pb) => (
              <Link
                key={pb.label}
                href={`/runs/${pb.runId}`}
                className="flex cursor-pointer items-center gap-3 p-4 transition-colors duration-200 hover:bg-raised"
              >
                <span className="label w-20 shrink-0 text-gold">{pb.label}</span>
                <span className="stat flex-1 text-xl">{duration(pb.seconds * 1000)}</span>
                <span className="stat text-sm text-muted">
                  {Math.floor(pb.seconds / PB_KM[pb.label] / 60)}:
                  {String(Math.round(pb.seconds / PB_KM[pb.label]) % 60).padStart(2, "0")} /km
                </span>
              </Link>
            ))}
          </Card>
        )}
      </section>

      <section className="mt-9">
        <h2 className="display mb-3 text-xl">Settings</h2>
        <Card className="grid gap-5 p-5">
          <Field label="Name">
            <input
              className={inputClass}
              value={profile.name}
              maxLength={40}
              onChange={(e) => save({ ...profile, name: e.target.value || "Runner" })}
            />
          </Field>

          <Field
            label="Weight (kg)"
            hint="Calories are estimated from your weight and pace, so a wrong number skews every run."
          >
            <input
              className={inputClass}
              type="number"
              inputMode="decimal"
              min={25}
              max={250}
              value={weightText === "" ? profile.weightKg : weightText}
              onChange={(e) => setWeightText(e.target.value)}
              onBlur={() => {
                if (weightValid) save({ ...profile, weightKg: weight });
                setWeightText("");
              }}
            />
          </Field>
          {!weightValid && (
            <p className="text-sm text-bad" role="status">Enter a weight between 25 and 250 kg.</p>
          )}

          <p className="text-xs text-muted">
            Runs are stored in this browser only, on this device. Nothing is uploaded anywhere —
            there is no account and no server yet. Clearing site data deletes them.
          </p>
        </Card>
      </section>

      <section className="mt-9">
        <h2 className="display mb-3 text-xl">Calories, honestly</h2>
        <Card className="flex gap-3 p-4">
          <Flame size={18} className="mt-0.5 shrink-0 text-accent" />
          <p className="text-sm text-muted">
            Estimated with the ACSM running equation — the same one treadmills use. It works from
            your pace and weight, so it cannot see your heart rate, the hill, the heat or the wind.
            Treat it as a decent guess, not a measurement.
          </p>
        </Card>
      </section>
    </div>
  );
}
