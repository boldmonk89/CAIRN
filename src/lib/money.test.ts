import { describe, expect, it } from "vitest";
import { expenseDebts, ledger, splitProportional, type Expense, type Ledger } from "./money.js";

const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
const abs = (x: bigint) => (x < 0n ? -x : x);

/** what `from` owes `to` on a ledger, 0 if the pair has no open debt */
const owes = (l: Ledger, from: string, to: string) =>
  l.debts.find((d) => d.from === from && d.to === to)?.amount ?? 0n;

describe("splitProportional", () => {
  it("splits in proportion to what each payer put in", () => {
    // the worked example: bill 2000, A paid 1200, B paid 800, a share of 400
    expect(splitProportional(400n, [["A", 1200n], ["B", 800n]]))
      .toEqual([["A", 240n], ["B", 160n]]);
  });

  it("gives the remainder to the last payer and never loses a unit", () => {
    const parts = splitProportional(100n, [["A", 333n], ["B", 667n]]);
    expect(parts).toEqual([["A", 33n], ["B", 67n]]);
    expect(sum(parts.map(([, v]) => v))).toBe(100n);
  });

  it("stays exact across every amount for an awkward three-way split", () => {
    for (let n = 0n; n <= 500n; n++) {
      const parts = splitProportional(n, [["A", 1n], ["B", 1n], ["C", 1n]]);
      expect(sum(parts.map(([, v]) => v))).toBe(n);
      expect(parts.every(([, v]) => v >= 0n)).toBe(true);
    }
  });

  it("handles amounts far past what a double can hold exactly", () => {
    const huge = 9_007_199_254_740_993n; // 2^53 + 1
    const parts = splitProportional(huge, [["A", 1n], ["B", 2n]]);
    expect(sum(parts.map(([, v]) => v))).toBe(huge);
  });

  it("refuses inputs that cannot mean anything", () => {
    expect(() => splitProportional(100n, [])).toThrow();
    expect(() => splitProportional(100n, [["A", 0n]])).toThrow();
    expect(() => splitProportional(-1n, [["A", 1n]])).toThrow();
  });
});

describe("a bill with two payers", () => {
  const dinner: Expense = {
    currency: "INR",
    amount: 2000n,
    paidBy: { A: 1200n, B: 800n },
    shares: { A: 400n, B: 400n, C: 400n, D: 400n, E: 400n },
  };
  const [l] = ledger([dinner]);

  it("has every non-payer owing A 240 and B 160", () => {
    for (const who of ["C", "D", "E"]) {
      expect(owes(l, who, "A")).toBe(240n);
      expect(owes(l, who, "B")).toBe(160n);
    }
  });

  it("nets the two payers against each other", () => {
    // A owes B 160 for A's own share; B owes A 240 for B's. Net: B owes A 80.
    expect(owes(l, "B", "A")).toBe(80n);
    expect(owes(l, "A", "B")).toBe(0n);
  });

  it("leaves A up 800 and B up 400, which is exactly paid minus consumed", () => {
    expect(l.balances).toEqual({ A: 800n, B: 400n, C: -400n, D: -400n, E: -400n });
  });

  it("never invents a pooled kitty: nobody owes 'the group'", () => {
    expect(l.debts.every((d) => d.from in dinner.shares && d.to in dinner.paidBy)).toBe(true);
  });
});

describe("uneven splits", () => {
  it("honours a per-person amount rather than assuming an even split", () => {
    const [l] = ledger([{
      currency: "GBP", amount: 1000n,
      paidBy: { A: 1000n },
      shares: { A: 100n, B: 250n, C: 650n },
    }]);
    expect(owes(l, "B", "A")).toBe(250n);
    expect(owes(l, "C", "A")).toBe(650n);
    expect(l.balances.A).toBe(900n);
  });

  it("leaves people out of a bill they had no part in", () => {
    const [l] = ledger([{
      currency: "GBP", amount: 300n,
      paidBy: { A: 300n }, shares: { A: 150n, B: 150n },
    }]);
    expect(l.balances.C).toBeUndefined();
  });
});

describe("settlements", () => {
  const dinner: Expense = {
    currency: "INR", amount: 300n,
    paidBy: { A: 300n }, shares: { A: 100n, B: 100n, C: 100n },
  };
  const claim = (confirmed: boolean, amount = 100n) =>
    [{ from: "B", to: "A", currency: "INR", amount, confirmed }];

  it("ignores a claim the recipient has not confirmed", () => {
    expect(owes(ledger([dinner], claim(false))[0], "B", "A")).toBe(100n);
  });

  it("clears the debt once the recipient confirms", () => {
    const [l] = ledger([dinner], claim(true));
    expect(owes(l, "B", "A")).toBe(0n);
    expect(l.balances.B ?? 0n).toBe(0n);
  });

  it("shows an overpayment as a debt back the other way", () => {
    expect(owes(ledger([dinner], claim(true, 130n))[0], "A", "B")).toBe(30n);
  });
});

describe("currencies", () => {
  it("keeps each currency on its own ledger and never converts", () => {
    const ls = ledger([
      { currency: "INR", amount: 200n, paidBy: { A: 200n }, shares: { A: 100n, B: 100n } },
      { currency: "JPY", amount: 200n, paidBy: { B: 200n }, shares: { A: 100n, B: 100n } },
    ]);
    const inr = ls.find((l) => l.currency === "INR")!;
    const jpy = ls.find((l) => l.currency === "JPY")!;
    expect(ls).toHaveLength(2);
    expect(owes(inr, "B", "A")).toBe(100n);
    expect(owes(jpy, "A", "B")).toBe(100n);
    // they do NOT cancel out into nothing, even though the numbers look equal
    expect(inr.debts).toHaveLength(1);
    expect(jpy.debts).toHaveLength(1);
  });
});

describe("every balance nets to zero", () => {
  // deterministic LCG so any failure is reproducible from the seed
  const rng = (seed: number) => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

  it("holds over 2000 random trips with multiple payers and uneven shares", () => {
    const rand = rng(20260829);
    const pick = (n: number) => Math.floor(rand() * n);
    let checked = 0;

    for (let trip = 0; trip < 2000; trip++) {
      const people = ["A", "B", "C", "D", "E", "F"].slice(0, 2 + pick(5));
      const expenses: Expense[] = [];

      const weigh = (who: string[]) => who.map((p) => [p, BigInt(1 + pick(9))] as const);
      const carve = (amount: bigint, who: string[]) =>
        Object.fromEntries(splitProportional(amount, weigh(who)).filter(([, v]) => v > 0n));

      for (let n = 0; n < 1 + pick(6); n++) {
        const amount = BigInt(1 + pick(100_000));
        const payers = people.filter(() => rand() < 0.4);
        const sharers = people.filter(() => rand() < 0.7);
        if (!payers.length) payers.push(people[pick(people.length)]);
        if (!sharers.length) sharers.push(people[pick(people.length)]);

        const paidBy = carve(amount, payers);
        const shares = carve(amount, sharers);
        // a zero-valued part got filtered out; that expense would not be storable
        if (sum(Object.values(paidBy)) !== amount) continue;
        if (sum(Object.values(shares)) !== amount) continue;
        expenses.push({ currency: "INR", amount, paidBy, shares });
      }
      if (!expenses.length) continue;
      checked++;

      const [l] = ledger(expenses);
      expect(sum(Object.values(l.balances))).toBe(0n);

      // Each balance tracks (paid - consumed). It can sit under a unit per
      // (payer x sharer) off it, because each share's remainder lands on that
      // share's last payer. The drift is bounded and always nets out.
      const slack = sum(expenses.map((e) =>
        BigInt(Object.keys(e.paidBy).length * Object.keys(e.shares).length)));
      for (const p of people) {
        const exact = sum(expenses.map((e) => (e.paidBy[p] ?? 0n) - (e.shares[p] ?? 0n)));
        expect(abs((l.balances[p] ?? 0n) - exact)).toBeLessThanOrEqual(slack);
      }
    }
    expect(checked).toBeGreaterThan(1500);
  });

  it("nets to zero for the pathological case: 1 unit, 5 ways, 3 payers", () => {
    const [l] = ledger([{
      currency: "INR", amount: 5n,
      paidBy: { A: 1n, B: 1n, C: 3n },
      shares: { A: 1n, B: 1n, C: 1n, D: 1n, E: 1n },
    }]);
    expect(sum(Object.values(l.balances))).toBe(0n);
  });
});

describe("expenseDebts guards", () => {
  it("refuses a bill nobody paid", () => {
    expect(() => expenseDebts({ currency: "INR", amount: 1n, paidBy: {}, shares: { A: 1n } }))
      .toThrow(/at least one payer/);
  });
});
