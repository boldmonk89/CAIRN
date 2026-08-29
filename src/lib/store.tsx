"use client";

import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import { ledger, type Expense, type Ledger, type Minor } from "./money";

// ponytail: all state is local and in-memory, persisted to localStorage. Swap
// this file's bodies for Supabase calls when we wire the backend; the component
// tree only knows the hooks below.

export interface Member { id: string; name: string; hue: number }

export interface Trip {
  id: string;
  name: string;
  place: string;
  currency: string;
  from: string;
  to: string;
  members: Member[];
}

export interface ExpenseRow {
  id: string;
  tripId: string;
  description: string;
  icon: string;
  currency: string;
  amount: Minor;
  paidBy: Record<string, Minor>;
  shares: Record<string, Minor>;
  spentAt: string;
  createdBy: string;
}

export interface SettlementRow {
  id: string;
  tripId: string;
  from: string;
  to: string;
  currency: string;
  amount: Minor;
  createdBy: string;
  confirmedAt: string | null;
  reference?: string;
}

interface State { trips: Trip[]; expenses: ExpenseRow[]; settlements: SettlementRow[] }

export const ME = "u1";

const PEOPLE: Member[] = [
  { id: "u1", name: "You", hue: 8 },
  { id: "u2", name: "Riya", hue: 268 },
  { id: "u3", name: "Arjun", hue: 200 },
  { id: "u4", name: "Meera", hue: 150 },
  { id: "u5", name: "Kabir", hue: 38 },
];

const seed = (): State => ({
  trips: [
    {
      id: "t1", name: "Mussoorie & Dhanaulti", place: "Uttarakhand, India",
      currency: "INR", from: "2026-09-08", to: "2026-09-11", members: PEOPLE,
    },
    {
      id: "t2", name: "Osaka food run", place: "Kansai, Japan",
      currency: "JPY", from: "2026-11-02", to: "2026-11-09",
      members: PEOPLE.slice(0, 3),
    },
  ],
  expenses: [
    {
      id: "e1", tripId: "t1", description: "Cab from Dehradun", icon: "🚕",
      currency: "INR", amount: 200000n,
      paidBy: { u1: 120000n, u2: 80000n },
      shares: { u1: 40000n, u2: 40000n, u3: 40000n, u4: 40000n, u5: 40000n },
      spentAt: "2026-09-08", createdBy: "u1",
    },
    {
      id: "e2", tripId: "t1", description: "Homestay, 3 nights", icon: "🏡",
      currency: "INR", amount: 1200000n,
      paidBy: { u3: 1200000n },
      shares: { u1: 240000n, u2: 240000n, u3: 240000n, u4: 240000n, u5: 240000n },
      spentAt: "2026-09-08", createdBy: "u3",
    },
    {
      id: "e3", tripId: "t1", description: "Dinner at Char Dukan", icon: "🍜",
      currency: "INR", amount: 386000n,
      paidBy: { u2: 386000n },
      // Kabir skipped dinner, Meera only had chai
      shares: { u1: 96000n, u2: 96000n, u3: 96000n, u4: 98000n },
      spentAt: "2026-09-09", createdBy: "u2",
    },
    {
      id: "e4", tripId: "t1", description: "Zipline at Company Garden", icon: "🪂",
      currency: "INR", amount: 250000n,
      paidBy: { u1: 250000n },
      shares: { u1: 50000n, u2: 50000n, u3: 50000n, u4: 50000n, u5: 50000n },
      spentAt: "2026-09-10", createdBy: "u1",
    },
    {
      id: "e5", tripId: "t2", description: "Shinkansen tickets", icon: "🚄",
      currency: "JPY", amount: 42000n,
      paidBy: { u2: 42000n }, shares: { u1: 14000n, u2: 14000n, u3: 14000n },
      spentAt: "2026-11-02", createdBy: "u2",
    },
  ],
  settlements: [
    {
      id: "s1", tripId: "t1", from: "u4", to: "u3", currency: "INR",
      amount: 100000n, createdBy: "u4", confirmedAt: null,
    },
  ],
});

// ---------------------------------------------------------------- persistence
// JSON has no bigint, so tag them on the way out and revive them on the way in.
const KEY = "cairn.v1";
const replacer = (_k: string, v: unknown) =>
  typeof v === "bigint" ? `${v}n` : v;
const reviver = (_k: string, v: unknown) =>
  typeof v === "string" && /^-?\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v;

const Ctx = createContext<{
  state: State;
  set: (fn: (s: State) => State) => void;
} | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(seed);
  const [loaded, setLoaded] = useState(false);

  // read once on mount, not during render: the server has no localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState(JSON.parse(raw, reviver));
    } catch {
      /* private mode, cleared storage, corrupt value — the seed stands */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return; // never write the seed over real data before we've read
    try {
      localStorage.setItem(KEY, JSON.stringify(state, replacer));
    } catch {
      /* quota or blocked storage: the app still works, it just won't persist */
    }
  }, [state, loaded]);

  const value = useMemo(
    () => ({ state, set: (fn: (s: State) => State) => setState(fn) }),
    [state],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStore must be used inside <StoreProvider>");
  return c;
}

export const useTrips = () => useStore().state.trips;

export function useTrip(id: string) {
  const { state } = useStore();
  return state.trips.find((t) => t.id === id);
}

export function useTripData(tripId: string) {
  const { state } = useStore();
  return useMemo(() => {
    const expenses = state.expenses
      .filter((e) => e.tripId === tripId)
      .sort((a, b) => b.spentAt.localeCompare(a.spentAt));
    const settlements = state.settlements.filter((s) => s.tripId === tripId);
    const ledgers = ledger(
      expenses.map((e): Expense => ({
        currency: e.currency, amount: e.amount, paidBy: e.paidBy, shares: e.shares,
      })),
      settlements.map((s) => ({
        from: s.from, to: s.to, currency: s.currency,
        amount: s.amount, confirmed: s.confirmedAt !== null,
      })),
    );
    return { expenses, settlements, ledgers };
  }, [state, tripId]);
}

export interface TripSummary {
  trip: Trip;
  expenseCount: number;
  /** your position on this trip, per currency; empty means settled up */
  mine: { currency: string; amount: Minor }[];
  pendingForMe: number; // claims waiting on you to confirm you received them
}

/** One pass over the whole store, so the list page runs the ledger once per trip. */
export function useTripSummaries(): TripSummary[] {
  const { state } = useStore();
  return useMemo(
    () =>
      state.trips.map((trip) => {
        const expenses = state.expenses.filter((e) => e.tripId === trip.id);
        const settlements = state.settlements.filter((s) => s.tripId === trip.id);
        const ls = ledger(
          expenses,
          settlements.map((s) => ({ ...s, confirmed: s.confirmedAt !== null })),
        );
        return {
          trip,
          expenseCount: expenses.length,
          mine: tripBalance(ls, ME),
          pendingForMe: settlements.filter((s) => s.to === ME && s.confirmedAt === null).length,
        };
      }),
    [state],
  );
}

/** Net position across every trip, per currency. Positive = you are owed. */
export function useOverallBalance(): { currency: string; amount: Minor }[] {
  const { state } = useStore();
  return useMemo(() => {
    const totals = new Map<string, Minor>();
    for (const trip of state.trips) {
      const ls = ledger(
        state.expenses.filter((e) => e.tripId === trip.id),
        state.settlements
          .filter((s) => s.tripId === trip.id)
          .map((s) => ({ ...s, confirmed: s.confirmedAt !== null })),
      );
      for (const l of ls) {
        const mine = l.balances[ME] ?? 0n;
        if (mine !== 0n) totals.set(l.currency, (totals.get(l.currency) ?? 0n) + mine);
      }
    }
    return [...totals].map(([currency, amount]) => ({ currency, amount }));
  }, [state]);
}

export function tripBalance(ledgers: Ledger[], userId: string) {
  return ledgers
    .map((l) => ({ currency: l.currency, amount: l.balances[userId] ?? 0n }))
    .filter((b) => b.amount !== 0n);
}

// ---------------------------------------------------------------- mutations
const id = () => crypto.randomUUID();

export function useActions() {
  const { set } = useStore();
  return useMemo(
    () => ({
      addExpense(e: Omit<ExpenseRow, "id">) {
        set((s) => ({ ...s, expenses: [...s.expenses, { ...e, id: id() }] }));
      },
      deleteExpense(expenseId: string) {
        set((s) => ({ ...s, expenses: s.expenses.filter((e) => e.id !== expenseId) }));
      },
      /** record that you sent money. It stays unconfirmed until they say it landed. */
      claimPayment(row: Omit<SettlementRow, "id" | "confirmedAt" | "createdBy">) {
        set((s) => ({
          ...s,
          settlements: [...s.settlements, {
            ...row, id: id(), createdBy: ME,
            // recording money you received is self-confirming; a claim is not
            confirmedAt: row.to === ME ? new Date().toISOString() : null,
          }],
        }));
      },
      /** only the recipient may do this — the UI never offers it to anyone else */
      confirmReceipt(settlementId: string, reference?: string) {
        set((s) => ({
          ...s,
          settlements: s.settlements.map((x) =>
            x.id === settlementId && x.to === ME && x.confirmedAt === null
              ? { ...x, confirmedAt: new Date().toISOString(), reference }
              : x),
        }));
      },
      cancelClaim(settlementId: string) {
        set((s) => ({
          ...s,
          settlements: s.settlements.filter(
            (x) => !(x.id === settlementId && x.confirmedAt === null)),
        }));
      },
      addTrip(t: Omit<Trip, "id">) {
        const tripId = id();
        set((s) => ({ ...s, trips: [...s.trips, { ...t, id: tripId }] }));
        return tripId;
      },
      reset() {
        set(() => seed());
      },
    }),
    [set],
  );
}
