"use client";

// Runs live in IndexedDB, not localStorage. A one-hour run is a few thousand
// GPS fixes; a handful of those blows past the 5 MB localStorage cap and the
// write fails silently, which would mean losing runs. IndexedDB has room and
// tells us when a write fails.

import { useCallback, useEffect, useState } from "react";
import { RUN_VERSION, summarise, type Run } from "./runs";

const DB_NAME = "cairn";
const VERSION = 1;
const STORE = "runs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" }).createIndex("startedAt", "startedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

/**
 * Recompute any run saved by an older version of the maths. Keyed on the run's
 * own version field, never on the store being empty — an "if there is no data"
 * migration also fires right after someone deliberately deletes everything,
 * and puts it all back.
 */
async function migrate(runs: Run[]): Promise<Run[]> {
  const stale = runs.filter((r) => r.v !== RUN_VERSION && r.track?.length);
  if (stale.length === 0) return runs;

  const { weightKg } = readProfile();
  const fixed = new Map(
    stale.map((r) => [r.id, { ...summarise(r.id, r.track, r.title, weightKg, r.note), note: r.note }]),
  );
  await Promise.all([...fixed.values()].map(putRun));
  return runs.map((r) => fixed.get(r.id) ?? r);
}

export const allRuns = () =>
  tx<Run[]>("readonly", (s) => s.getAll() as IDBRequest<Run[]>)
    .then(migrate)
    .then((rs) => rs.sort((a, b) => b.startedAt - a.startedAt));

export const getRun = (id: string) =>
  tx<Run | undefined>("readonly", (s) => s.get(id))
    // the detail page can be opened directly, so it needs the same correction
    .then(async (r) => (r ? (await migrate([r]))[0] : r));
export const putRun = (run: Run) => tx("readwrite", (s) => s.put(run));
export const removeRun = (id: string) => tx("readwrite", (s) => s.delete(id));

// ------------------------------------------------------------------ profile
// Small, non-critical, and needed synchronously on first paint — localStorage
// is the right size of tool for this one.

export interface Profile {
  name: string;
  weightKg: number;
  /** kg matters: calories are computed from it, so a wrong value skews history */
  units: "km" | "mi";
}

const PROFILE_KEY = "cairn.profile";
export const DEFAULT_PROFILE: Profile = { name: "Runner", weightKg: 70, units: "km" };

export function readProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function writeProfile(p: Profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* blocked storage: the app still runs, the setting just won't stick */
  }
}

// ------------------------------------------------------------------- hooks

export function useRuns() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    allRuns().then(setRuns).catch((e) => setError(String(e?.message ?? e)));
  }, []);

  useEffect(reload, [reload]);
  return { runs, error, reload };
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);

  // read after mount: there is no localStorage during server rendering
  useEffect(() => setProfile(readProfile()), []);

  const save = useCallback((next: Profile) => {
    setProfile(next);
    writeProfile(next);
  }, []);

  return { profile, save };
}
