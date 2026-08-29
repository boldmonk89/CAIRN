"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Amount, Avatar, AvatarStack, Card, Empty, Field, Sheet, inputClass } from "@/components/ui";
import { ExpenseSheet } from "@/components/expense-sheet";
import { formatMoney, parseMoney, toInputString, type Debt, type Minor } from "@/lib/money";
import {
  ME, tripBalance, useActions, useTrip, useTripData,
  type ExpenseRow, type Member, type SettlementRow,
} from "@/lib/store";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

export default function TripPage() {
  const { id } = useParams<{ id: string }>();
  const trip = useTrip(id);
  const { expenses, settlements, ledgers } = useTripData(id);
  const [tab, setTab] = useState<"expenses" | "balances">("expenses");
  const [adding, setAdding] = useState(false);

  if (!trip) {
    return (
      <div className="p-5">
        <Empty icon="🤷" title="Trip not found" body="It may have been deleted." />
        <Link href="/" className="mx-auto block w-fit font-semibold text-accent underline">
          Back to your trips
        </Link>
      </div>
    );
  }

  const nameOf = (uid: string) => trip.members.find((m) => m.id === uid)?.name ?? "Someone";
  const mine = tripBalance(ledgers, ME);

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-bg/95 backdrop-blur">
        <div className="flex items-center gap-2 px-3 pt-3">
          <Link
            href="/"
            aria-label="Back to your trips"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full hover:bg-line"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold leading-tight">{trip.name}</h1>
            <p className="truncate text-xs text-muted">{trip.place} · {trip.currency}</p>
          </div>
          <AvatarStack members={trip.members} max={3} />
        </div>

        <div role="tablist" aria-label="Trip sections" className="flex gap-6 px-5 pt-2">
          {(["expenses", "balances"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`min-h-11 border-b-2 text-sm font-semibold capitalize ${
                tab === t ? "border-ink text-ink" : "border-transparent text-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      {mine.length > 0 && (
        <div className="px-5 pt-4">
          <Card className="flex items-baseline justify-between gap-3 p-4">
            <span className="text-sm text-muted">
              {mine[0].amount > 0n ? "You're owed" : "You owe"}
            </span>
            <span className="text-xl font-bold">
              {mine.map((b) => (
                <Amount key={b.currency} minor={b.amount} currency={b.currency} className="ml-3" />
              ))}
            </span>
          </Card>
        </div>
      )}

      {tab === "expenses"
        ? <Expenses expenses={expenses} members={trip.members} />
        : <Balances
            ledgerDebts={ledgers.flatMap((l) => l.debts)}
            settlements={settlements}
            members={trip.members}
            nameOf={nameOf}
          />}

      <button
        type="button"
        onClick={() => setAdding(true)}
        className="fixed bottom-[86px] left-1/2 z-10 flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full bg-accent px-5 font-semibold text-white shadow-lg"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        Add expense
      </button>

      <ExpenseSheet trip={trip} open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function Expenses({ expenses, members }: { expenses: ExpenseRow[]; members: Member[] }) {
  const { deleteExpense } = useActions();
  const nameOf = (uid: string) => (uid === ME ? "You" : members.find((m) => m.id === uid)?.name ?? "Someone");

  if (expenses.length === 0) {
    return <Empty icon="🧾" title="No expenses yet" body="Add the first one — a cab, a meal, the room." />;
  }

  const days = [...new Set(expenses.map((e) => e.spentAt))];

  return (
    <div className="px-5 pb-28 pt-4">
      {days.map((d) => (
        <section key={d} className="mb-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{day(d)}</h2>
          <Card className="divide-y divide-line">
            {expenses.filter((e) => e.spentAt === d).map((e) => {
              // what this one bill did to your position
              const net = (e.paidBy[ME] ?? 0n) - (e.shares[ME] ?? 0n);
              const payers = Object.keys(e.paidBy);
              return (
                <div key={e.id} className="flex items-center gap-3 p-3">
                  <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-bg text-lg">
                    {e.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.description}</p>
                    <p className="truncate text-xs text-muted">
                      {payers.length === 1
                        ? `${nameOf(payers[0])} paid ${formatMoney(e.amount, e.currency)}`
                        : `${payers.map(nameOf).join(" & ")} paid ${formatMoney(e.amount, e.currency)}`}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted">
                      {net > 0n ? "you lent" : net < 0n ? "you owe" : "not yours"}
                    </p>
                    <Amount minor={net} currency={e.currency} className="text-sm font-semibold" />
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteExpense(e.id)}
                    aria-label={`Delete ${e.description}`}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:bg-bg hover:text-bad"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </Card>
        </section>
      ))}
    </div>
  );
}

function Balances({
  ledgerDebts, settlements, members, nameOf,
}: {
  ledgerDebts: Debt[];
  settlements: SettlementRow[];
  members: Member[];
  nameOf: (id: string) => string;
}) {
  const { confirmReceipt, cancelClaim } = useActions();
  const [paying, setPaying] = useState<Debt | null>(null);

  const memberOf = (uid: string) => members.find((m) => m.id === uid)!;
  const involvesMe = (d: Debt) => d.from === ME || d.to === ME;
  const mineFirst = [...ledgerDebts].sort((a, b) => Number(involvesMe(b)) - Number(involvesMe(a)));

  // claims sitting on someone's confirmation. Only the recipient may confirm.
  const pending = settlements.filter((s) => s.confirmedAt === null);

  return (
    <div className="px-5 pb-28 pt-4">
      {pending.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Waiting on confirmation
          </h2>
          <Card className="divide-y divide-line">
            {pending.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 p-3">
                <Avatar member={memberOf(s.from)} size={32} />
                <p className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{nameOf(s.from)}</span> says they sent{" "}
                  <Amount minor={s.amount} currency={s.currency} tone="neutral" className="font-semibold" /> to{" "}
                  <span className="font-medium">{s.to === ME ? "you" : nameOf(s.to)}</span>
                </p>
                {s.to === ME ? (
                  <button
                    type="button"
                    onClick={() => confirmReceipt(s.id)}
                    className="min-h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white"
                  >
                    I got it
                  </button>
                ) : s.from === ME ? (
                  <button
                    type="button"
                    onClick={() => cancelClaim(s.id)}
                    className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                ) : (
                  <span className="text-xs text-muted">
                    only {nameOf(s.to)} can confirm this
                  </span>
                )}
              </div>
            ))}
          </Card>
          <p className="mt-2 text-xs text-muted">
            A payment only clears the debt once the person who received it says so.
          </p>
        </section>
      )}

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Who owes whom</h2>
      {mineFirst.length === 0 ? (
        <Empty icon="✅" title="Everyone's square" body="No open debts on this trip." />
      ) : (
        <Card className="divide-y divide-line">
          {mineFirst.map((d) => (
            <div key={`${d.from}-${d.to}-${d.currency}`} className="flex items-center gap-3 p-3">
              <Avatar member={memberOf(d.from)} size={32} />
              <p className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{d.from === ME ? "You" : nameOf(d.from)}</span>
                <span className="text-muted"> {d.from === ME ? "owe" : "owes"} </span>
                <span className="font-medium">{d.to === ME ? "you" : nameOf(d.to)}</span>
                <br />
                <Amount minor={d.amount} currency={d.currency} tone="neutral" className="font-semibold" />
              </p>
              {d.from === ME && (
                <button
                  type="button"
                  onClick={() => setPaying(d)}
                  className="min-h-11 shrink-0 rounded-xl bg-accent px-4 text-sm font-semibold text-white"
                >
                  Settle up
                </button>
              )}
            </div>
          ))}
        </Card>
      )}

      <SettleSheet debt={paying} onClose={() => setPaying(null)} nameOf={nameOf} />
    </div>
  );
}

function SettleSheet({
  debt, onClose, nameOf,
}: { debt: Debt | null; onClose: () => void; nameOf: (id: string) => string }) {
  const { claimPayment } = useActions();
  const { id: tripId } = useParams<{ id: string }>();
  const [text, setText] = useState("");
  const [reference, setReference] = useState("");

  // reset the typed amount whenever a different debt opens the sheet
  const [seen, setSeen] = useState<string | null>(null);
  if (debt && seen !== debt.from + debt.to + debt.currency) {
    setSeen(debt.from + debt.to + debt.currency);
    setText(toInputString(debt.amount, debt.currency));
  }

  const amount: Minor | null = debt ? parseMoney(text, debt.currency) : null;
  const problem =
    amount === null || amount <= 0n
      ? "Enter how much you sent"
      : debt && amount > debt.amount
        ? `That's more than the ${formatMoney(debt.amount, debt.currency)} you owe`
        : null;

  return (
    <Sheet
      open={debt !== null}
      onClose={onClose}
      title={debt ? `Pay ${nameOf(debt.to)}` : "Settle up"}
    >
      {debt && (
        <div className="grid gap-5">
          <Field
            label={`Amount (${debt.currency})`}
            hint={`You owe ${nameOf(debt.to)} ${formatMoney(debt.amount, debt.currency)}.`}
          >
            <input
              className={`${inputClass} text-2xl font-semibold`}
              inputMode="decimal"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>

          <Field label="Reference (optional)" hint="A UPI reference, or just “cash”.">
            <input
              className={inputClass}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="cash"
              maxLength={80}
            />
          </Field>

          <p className="rounded-xl bg-accent-soft p-3 text-sm">
            This records that you sent the money. It stays open until{" "}
            <span className="font-semibold">{nameOf(debt.to)}</span> confirms it arrived — you
            can&apos;t confirm your own payment.
          </p>

          {problem && <p className="text-sm text-bad" role="status">{problem}</p>}
          <button
            type="button"
            disabled={problem !== null}
            onClick={() => {
              if (!amount || problem) return;
              claimPayment({
                tripId, from: debt.from, to: debt.to,
                currency: debt.currency, amount,
                reference: reference.trim() || undefined,
              });
              setReference("");
              onClose();
            }}
            className="min-h-12 w-full rounded-xl bg-accent font-semibold text-white disabled:bg-line disabled:text-muted"
          >
            I sent it
          </button>
        </div>
      )}
    </Sheet>
  );
}
