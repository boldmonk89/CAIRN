"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { RouteMap } from "@/components/route-map";
import { Button, Stat } from "@/components/ui";
import { Back, Pause, Play, Satellite, Stop, Warning } from "@/components/icons";
import { GPS, haversine, pace, type Fix } from "@/lib/geo";
import { allRuns, putRun, useProfile } from "@/lib/db";
import { achievementsFor, summarise } from "@/lib/runs";
import { clock, defaultTitle, km, paceLabel } from "@/lib/format";

type Phase = "idle" | "locating" | "running" | "paused" | "saving";

export default function RecordPage() {
  const router = useRouter();
  const { profile } = useProfile();

  const [phase, setPhase] = useState<Phase>("idle");
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [distance, setDistance] = useState(0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Refs, not state: the geolocation callback fires outside React's render
  // cycle and must see the latest values without re-subscribing the watch.
  const watchId = useRef<number | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const lastFix = useRef<Fix | null>(null);
  const distanceRef = useRef(0);
  const movingMs = useRef(0);
  const startedAt = useRef<number | null>(null);
  const pausedMs = useRef(0);
  const pausedAt = useRef<number | null>(null);

  phaseRef.current = phase;

  const elapsed =
    startedAt.current === null
      ? 0
      : (pausedAt.current ?? Date.now()) - startedAt.current - pausedMs.current;

  // ---------------------------------------------------------------- wake lock
  // Released automatically whenever the tab is hidden, so re-take it on return.
  const holdScreen = useCallback(async () => {
    try {
      if ("wakeLock" in navigator && !wakeLock.current) {
        wakeLock.current = await navigator.wakeLock.request("screen");
        wakeLock.current.addEventListener("release", () => { wakeLock.current = null; });
      }
    } catch {
      /* denied or unsupported — tracking still works while the screen is on */
    }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && phaseRef.current === "running") holdScreen();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [holdScreen]);

  // ------------------------------------------------------------------- clock
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // --------------------------------------------------------------- gps watch
  const onPosition = useCallback((pos: GeolocationPosition) => {
    setAccuracy(pos.coords.accuracy);
    if (phaseRef.current !== "running") return;

    const fix: Fix = {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      t: pos.timestamp,
      accuracy: pos.coords.accuracy,
      altitude: pos.coords.altitude,
    };
    if (fix.accuracy > GPS.maxAccuracy) return; // too vague to believe

    const prev = lastFix.current;
    if (prev) {
      const dt = (fix.t - prev.t) / 1000;
      if (dt <= 0) return;
      const step = haversine(prev, fix);
      if (step / dt > GPS.maxSpeed) return; // receiver jumped; ignore the fix
      distanceRef.current += step;
      if (step / dt >= GPS.stillSpeed) movingMs.current += dt * 1000;
      setDistance(distanceRef.current);
    }
    lastFix.current = fix;
    setFixes((f) => [...f, fix]);
  }, []);

  const onGpsError = useCallback((e: GeolocationPositionError) => {
    setError(
      e.code === e.PERMISSION_DENIED
        ? "Location permission was refused. Allow it in your browser's site settings, then try again."
        : e.code === e.POSITION_UNAVAILABLE
          ? "No GPS signal. Step outside or away from tall buildings."
          : "Couldn't get a location fix in time. Try again.",
    );
    setPhase("idle");
  }, []);

  const startWatch = useCallback(() => {
    if (watchId.current !== null) return;
    if (!("geolocation" in navigator)) {
      setError("This browser has no Geolocation API.");
      return;
    }
    watchId.current = navigator.geolocation.watchPosition(onPosition, onGpsError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20_000,
    });
  }, [onPosition, onGpsError]);

  // stop the watch and let the screen sleep when this screen goes away
  useEffect(() => () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    wakeLock.current?.release().catch(() => {});
  }, []);

  // ----------------------------------------------------------------- actions
  function start() {
    setError(null);
    if (!window.isSecureContext) {
      setError("Location needs a secure context. Use http://localhost or an https:// address.");
      return;
    }
    setPhase("locating");
    startWatch();
    startedAt.current = Date.now();
    setPhase("running");
    holdScreen();
  }

  function togglePause() {
    if (phase === "running") {
      pausedAt.current = Date.now();
      setPhase("paused");
      wakeLock.current?.release().catch(() => {});
      wakeLock.current = null;
    } else if (phase === "paused") {
      pausedMs.current += Date.now() - (pausedAt.current ?? Date.now());
      pausedAt.current = null;
      // ponytail: the gap is not recorded, so a route walked while paused draws
      // as a straight line. Store a segment index per fix if that ever matters.
      lastFix.current = null;
      setPhase("running");
      holdScreen();
    }
  }

  async function finish() {
    setPhase("saving");
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;

    if (fixes.length < 2) {
      setError("That run has no usable GPS points, so there's nothing to save.");
      setPhase("idle");
      return;
    }

    const id = crypto.randomUUID();
    const startTs = fixes[0].t;
    const run = summarise(id, fixes, defaultTitle(startTs), profile.weightKg);
    try {
      const previous = await allRuns();
      const earned = achievementsFor(run, previous);
      await putRun(run);
      sessionStorage.setItem(`cairn.earned.${id}`, JSON.stringify(earned));
      router.replace(`/runs/${id}`);
    } catch (e) {
      setError(`Couldn't save the run: ${(e as Error).message}. Don't leave this screen yet.`);
      setPhase("paused");
    }
  }

  const live = phase === "running" || phase === "paused";
  const avgPace = pace(distance, movingMs.current);
  const signal =
    accuracy === null ? "searching"
    : accuracy <= 10 ? "strong"
    : accuracy <= GPS.maxAccuracy ? "fair"
    : "weak";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-2 px-3 pt-3">
        <Link
          href="/"
          aria-label="Leave the recorder"
          className="grid h-11 w-11 cursor-pointer place-items-center rounded-full text-muted hover:bg-raised hover:text-ink"
        >
          <Back />
        </Link>
        <p
          className="label ml-auto flex items-center gap-2"
          style={{ color: signal === "strong" ? "var(--color-good)" : signal === "weak" ? "var(--color-bad)" : "var(--color-muted)" }}
        >
          <Satellite size={15} />
          {accuracy === null ? "Searching" : `${signal} · ±${Math.round(accuracy)}m`}
        </p>
      </header>

      <div className="px-5 pt-4">
        <Stat
          label="Distance"
          value={<span className="text-accent">{km(distance)}</span>}
          unit="km"
          size="hero"
        />
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat label="Time" value={clock(elapsed)} />
          <Stat label="Avg pace" value={paceLabel(avgPace)} unit="/km" />
          <Stat label="Moving" value={clock(movingMs.current)} />
        </div>
      </div>

      <div className="relative mt-5 min-h-[220px] flex-1 overflow-hidden border-y border-line">
        <RouteMap track={fixes} live className="absolute inset-0 h-full w-full" interactive={false} />
      </div>

      {error && (
        <p className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm text-bad" role="alert">
          <Warning size={18} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {!live && !error && (
        <p className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-line bg-card p-3 text-xs text-muted">
          <Warning size={18} className="mt-0.5 shrink-0" />
          <span>
            Tracking only runs while this screen is open. The browser stops GPS when you lock the
            phone or switch apps — that&apos;s a platform rule, not a setting. Cairn keeps the screen
            awake for you while recording.
          </span>
        </p>
      )}

      <div className="sticky bottom-0 flex items-center justify-center gap-4 bg-ground/95 px-5 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] backdrop-blur">
        {phase === "idle" || phase === "locating" ? (
          <Button onClick={start} disabled={phase === "locating"} className="flex h-16 w-full items-center justify-center gap-2 text-lg">
            <Play size={22} />
            {phase === "locating" ? "Finding you…" : "Start run"}
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={togglePause} className="flex h-16 flex-1 items-center justify-center gap-2">
              {phase === "running" ? <Pause size={20} /> : <Play size={20} />}
              {phase === "running" ? "Pause" : "Resume"}
            </Button>
            <Button
              onClick={finish}
              disabled={phase === "saving"}
              className="flex h-16 flex-1 items-center justify-center gap-2"
            >
              <Stop size={20} />
              {phase === "saving" ? "Saving…" : "Finish"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
