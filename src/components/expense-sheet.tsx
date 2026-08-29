"use client";

import { useMemo, useState } from "react";
import { Avatar, Field, Sheet, inputClass } from "@/components/ui";
import {
  formatMoney, minorUnits, parseMoney, splitProportional, toInputString, type Minor,
} from "@/lib/money";
import { ME, useActions, type Trip } from "@/lib/store";

const ICONS = ["🍜", "🏡", "🚕", "🎟️", "🛒", "⛽", "☕", "🪂"];

const sum = (xs: Minor[]) => xs.reduce((a, b) => a + b, 0n);

/** even split that still adds up to the last unit */
const evenly = (amount: Minor, ids: string[]) =>
  Object.fromEntries(splitProportional(amount, ids.map((id) => [id, 1n] as const)));

export function ExpenseSheet({
  trip, open, onClose,
}: { trip: Trip; open: boolean; onClose: () => void }) {
  const { addExpense } = useActions();
  const currency = trip.currency;
  const everyone = trip.members.map((m) => m.id);

  const [amountText, setAmountText] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState(ICONS[0]);
  const [payers, setPayers] = useState<string[]>([ME]);
  const [payerText, setPayerText] = useState<Record<string, string>>({});
  const [sharers, setSharers] = useState<string[]>(everyone);
  const [custom, setCustom] = useState(false);
  const [shareText, setShareText] = useState<Record<string, string>>({});

  const amount = parseMoney(amountText, currency);

  // A single payer put down the whole bill; several means we need per-person amounts.
  const paidBy = useMemo<Record<string, Minor> | null>(() => {
    if (amount === null || payers.length === 0) return null;
    if (payers.length === 1) return { [payers[0]]: amount };
    const out: Record<string, Minor> = {};
    for (const id of payers) {
      const v = parseMoney(payerText[id] ?? "", currency);
      if (v === null) return null;
      out[id] = v;
    }
    return out;
  }, [amount, payers, payerText, currency]);

  const shares = useMemo<Record<string, Minor> | null>(() => {
    if (amount === null || sharers.length === 0) return null;
    if (!custom) return evenly(amount, sharers);
    const out: Record<string, Minor> = {};
    for (const id of sharers) {
      const v = parseMoney(shareText[id] ?? "", currency);
      if (v === null) return null;
      out[id] = v;
    }
    return out;
  }, [amount, sharers, custom, shareText, currency]);

  const paidTotal = paidBy ? sum(Object.values(paidBy)) : null;
  const shareTotal = shares ? sum(Object.values(shares)) : null;

  // The database refuses an unbalanced bill; say so here rather than let them try.
  const problem =
    amount === null || amount <= 0n ? "Enter an amount"
    : !description.trim() ? "Add a short description"
    : payers.length === 0 ? "Pick who paid"
    : sharers.length === 0 ? "Pick who this is split between"
    : paidTotal === null ? "Check the amounts next to each payer"
    : paidTotal !== amount
      ? `Payers add up to ${formatMoney(paidTotal, currency)}, not ${formatMoney(amount, currency)}`
    : shareTotal === null ? "Check the amounts next to each person"
    : shareTotal !== amount
      ? `Split adds up to ${formatMoney(shareTotal, currency)}, not ${formatMoney(amount, currency)}`
    : null;

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) =>
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  function save() {
    if (problem || !amount || !paidBy || !shares) return;
    addExpense({
      tripId: trip.id, description: description.trim(), icon, currency, amount,
      // a person with a zero share isn't part of the bill at all
      paidBy: Object.fromEntries(Object.entries(paidBy).filter(([, v]) => v > 0n)),
      shares: Object.fromEntries(Object.entries(shares).filter(([, v]) => v > 0n)),
      spentAt: new Date().toISOString().slice(0, 10),
      createdBy: ME,
    });
    setAmountText(""); setDescription(""); setPayers([ME]); setPayerText({});
    setSharers(everyone); setCustom(false); setShareText({});
    onClose();
  }

  const step = 1 / 10 ** minorUnits(currency);

  return (
    <Sheet open={open} onClose={onClose} title="Add an expense">
      <div className="grid gap-5">
        <Field label={`Amount (${currency})`}>
          <input
            className={`${inputClass} text-2xl font-semibold`}
            inputMode="decimal"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            placeholder={step === 1 ? "0" : "0.00"}
          />
        </Field>

        <Field label="What was it for">
          <input
            className={inputClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Dinner at Char Dukan"
            maxLength={200}
          />
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Category</legend>
          <div className="rail flex gap-2">
            {ICONS.map((i) => (
              <button
                key={i} type="button" onClick={() => setIcon(i)}
                aria-pressed={icon === i} aria-label={`Category ${i}`}
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border text-lg ${
                  icon === i ? "border-ink bg-accent-soft" : "border-line bg-card"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        </fieldset>

        <PersonPicker
          legend="Who paid"
          trip={trip}
          selected={payers}
          onToggle={(id) => toggle(payers, setPayers, id)}
          amounts={payers.length > 1 ? payerText : null}
          onAmount={(id, v) => setPayerText({ ...payerText, [id]: v })}
          currency={currency}
          note={payers.length > 1 ? "Two people put money down — say how much each." : undefined}
          onSplitRest={
            payers.length > 1 && amount
              ? () => setPayerText(
                  Object.fromEntries(
                    Object.entries(evenly(amount, payers)).map(([k, v]) => [k, toInputString(v, currency)]),
                  ))
              : undefined
          }
        />

        <PersonPicker
          legend="Split between"
          trip={trip}
          selected={sharers}
          onToggle={(id) => toggle(sharers, setSharers, id)}
          amounts={custom ? shareText : null}
          onAmount={(id, v) => setShareText({ ...shareText, [id]: v })}
          currency={currency}
          preview={!custom && amount ? evenly(amount, sharers) : undefined}
          toggleLabel={custom ? "Split evenly instead" : "Enter different amounts"}
          onToggleMode={() => {
            if (!custom && amount) {
              setShareText(Object.fromEntries(
                Object.entries(evenly(amount, sharers)).map(([k, v]) => [k, toInputString(v, currency)])));
            }
            setCustom(!custom);
          }}
        />

        <div className="sticky bottom-0 -mx-4 border-t border-line bg-card px-4 pb-1 pt-3">
          {problem && <p className="mb-2 text-sm text-bad" role="status">{problem}</p>}
          <button
            type="button"
            onClick={save}
            disabled={problem !== null}
            className="min-h-12 w-full rounded-xl bg-accent font-semibold text-white disabled:bg-line disabled:text-muted"
          >
            Add expense
          </button>
        </div>
      </div>
    </Sheet>
  );
}

function PersonPicker({
  legend, trip, selected, onToggle, amounts, onAmount, currency,
  preview, note, toggleLabel, onToggleMode, onSplitRest,
}: {
  legend: string;
  trip: Trip;
  selected: string[];
  onToggle: (id: string) => void;
  amounts: Record<string, string> | null;
  onAmount: (id: string, value: string) => void;
  currency: string;
  preview?: Record<string, Minor>;
  note?: string;
  toggleLabel?: string;
  onToggleMode?: () => void;
  onSplitRest?: () => void;
}) {
  return (
    <fieldset>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <legend className="text-sm font-medium">{legend}</legend>
        {onToggleMode && (
          <button type="button" onClick={onToggleMode} className="text-sm font-medium text-accent underline">
            {toggleLabel}
          </button>
        )}
        {onSplitRest && (
          <button type="button" onClick={onSplitRest} className="text-sm font-medium text-accent underline">
            Split evenly
          </button>
        )}
      </div>
      {note && <p className="mb-2 text-xs text-muted">{note}</p>}

      <ul className="grid gap-1">
        {trip.members.map((m) => {
          const on = selected.includes(m.id);
          return (
            <li key={m.id} className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onToggle(m.id)}
                aria-pressed={on}
                className={`flex min-h-11 flex-1 items-center gap-3 rounded-xl border px-3 text-left ${
                  on ? "border-ink bg-accent-soft" : "border-line bg-card"
                }`}
              >
                <Avatar member={m} size={28} />
                <span className="flex-1 truncate text-sm font-medium">{m.name}</span>
                {on && preview?.[m.id] !== undefined && (
                  <span className="text-sm tabular-nums text-muted">
                    {formatMoney(preview[m.id], currency)}
                  </span>
                )}
              </button>
              {on && amounts && (
                <input
                  className={`${inputClass} w-28 text-right`}
                  inputMode="decimal"
                  aria-label={`Amount for ${m.name}`}
                  value={amounts[m.id] ?? ""}
                  onChange={(e) => onAmount(m.id, e.target.value)}
                  placeholder="0"
                />
              )}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
