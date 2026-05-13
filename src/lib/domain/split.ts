import type { Expense } from "@/lib/types/database";

// ─── Split / who-owes-who ───
// Travel OS supports group expenses without forcing a separate Splitwise account.
// Model: each Expense has paid_by (single user) and shared_with (array of users
// inc. paid_by). Equal split: total / count(shared_with). Each non-payer owes
// the payer total/N. We aggregate net balances and emit minimal transactions.
//
// NB: Expense already has notes/metadata fields. To keep the schema unchanged
// we encode split metadata into Expense.notes when needed, OR rely on a side
// table. For this MVP we add a parallel typed wrapper around expenses; callers
// pass the split metadata explicitly.

export interface SplitMeta {
  paid_by: string;
  shared_with: string[]; // including paid_by
}

export interface Balance {
  user: string;
  net: number; // positive = is owed money; negative = owes money
}

export interface Settlement {
  from: string; // owes
  to: string;   // is owed
  amount: number;
}

export interface SplitSummary {
  by_user: Balance[];
  settlements: Settlement[];
  total: number;
  count: number;
}

export interface SplitExpense extends Expense {
  split?: SplitMeta;
}

function nearZero(n: number): boolean { return Math.abs(n) < 0.005; }

export function buildSplitSummary(expenses: SplitExpense[]): SplitSummary {
  const ledger = new Map<string, number>();
  let total = 0;
  let count = 0;

  for (const e of expenses) {
    if (!e.split || !e.split.shared_with.length) continue;
    const { paid_by, shared_with } = e.split;
    const n = shared_with.length;
    if (n === 0) continue;
    const share = e.base_amount / n;
    // Payer gets credited the full amount; each member is debited their share
    ledger.set(paid_by, (ledger.get(paid_by) || 0) + e.base_amount);
    for (const u of shared_with) {
      ledger.set(u, (ledger.get(u) || 0) - share);
    }
    total += e.base_amount;
    count++;
  }

  const by_user: Balance[] = Array.from(ledger.entries())
    .map(([user, net]) => ({ user, net: Math.round(net * 100) / 100 }))
    .filter(b => !nearZero(b.net))
    .sort((a, b) => b.net - a.net);

  // Greedy settlement: highest creditor receives from highest debtor until both clear.
  const settlements: Settlement[] = [];
  const creditors = by_user.filter(b => b.net > 0).map(b => ({ ...b }));
  const debtors = by_user.filter(b => b.net < 0).map(b => ({ ...b }));
  let i = 0, j = 0;
  while (i < creditors.length && j < debtors.length) {
    const c = creditors[i];
    const d = debtors[j];
    const amount = Math.min(c.net, -d.net);
    if (amount > 0.005) {
      settlements.push({ from: d.user, to: c.user, amount: Math.round(amount * 100) / 100 });
    }
    c.net -= amount;
    d.net += amount;
    if (nearZero(c.net)) i++;
    if (nearZero(d.net)) j++;
  }

  return { by_user, settlements, total, count };
}

/** Parse legacy notes-encoded split (so we can add the feature without DB migration yet). */
export function parseSplitFromNotes(notes: string | null): SplitMeta | null {
  if (!notes) return null;
  const m = notes.match(/__SPLIT__:({.*?})__/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]) as SplitMeta;
    if (parsed.paid_by && Array.isArray(parsed.shared_with)) return parsed;
  } catch { /* ignore */ }
  return null;
}

export function encodeSplitToNotes(notes: string | null, split: SplitMeta | null): string {
  const stripped = (notes || "").replace(/__SPLIT__:{.*?}__/g, "").trim();
  if (!split) return stripped;
  const tag = `__SPLIT__:${JSON.stringify(split)}__`;
  return stripped ? `${stripped}\n${tag}` : tag;
}
