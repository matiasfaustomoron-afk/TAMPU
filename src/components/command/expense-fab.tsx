"use client";
import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { useActiveTrip, useMutations } from "@/lib/hooks/use-trip-data";
import { useI18n } from "@/i18n/provider";
import { BUDGET_CATEGORIES, CURRENCIES, PAYMENT_METHODS } from "@/lib/config/constants";
import { haptic } from "@/lib/native/platform";
import { Plus, X, Zap } from "lucide-react";

const LAST_USED_KEY = "travel-os-expense-defaults";

interface Defaults {
  currency: string;
  category: string;
  payment_method: string;
}

function loadDefaults(base: string): Defaults {
  if (typeof window === "undefined") return { currency: base, category: "food", payment_method: "credit_card_black" };
  try {
    const raw = localStorage.getItem(LAST_USED_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { currency: base, category: "food", payment_method: "credit_card_black" };
}

function saveDefaults(d: Defaults) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(LAST_USED_KEY, JSON.stringify(d)); } catch {}
}

export function ExpenseFab() {
  const { data: trip } = useActiveTrip();
  const { addExpense } = useMutations();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [defaults, setDefaults] = useState<Defaults>(() => loadDefaults("USD"));
  const [busy, setBusy] = useState(false);

  const submit = useCallback(async () => {
    if (!trip || !amount) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return;
    setBusy(true);
    await haptic("medium"); // confirmation that the action started
    await addExpense({
      trip_id: trip.id,
      date: new Date().toISOString().split("T")[0],
      city_id: null,
      city_name: null,
      category: defaults.category,
      subcategory: null,
      description: description || `${t.commandQuickExpense.defaultDescription} ${defaults.category}`,
      payment_method: defaults.payment_method,
      original_currency: defaults.currency,
      original_amount: amt,
      exchange_rate: 1,
      base_amount: amt, // simplification: same as original; user can edit in /expenses
      is_fixed: false,
      is_budgeted: true,
      reservation_id: null,
      attachment_url: null,
      notes: null,
    });
    saveDefaults(defaults);
    setAmount("");
    setDescription("");
    setBusy(false);
    setOpen(false);
  }, [trip, amount, description, defaults, addExpense]);

  if (!trip) return null;

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <Card className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2"><Zap className="w-4 h-4 text-primary" />{t.commandQuickExpense.title}</h3>
                <button onClick={() => setOpen(false)} className="text-muted-foreground"><X className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-[10px] uppercase text-muted-foreground">{t.expenses.amount}</label>
                  <Input type="number" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} className="mt-1 text-lg" autoFocus />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">{t.expenses.currency}</label>
                  <SelectNative value={defaults.currency} onChange={e => setDefaults({ ...defaults, currency: e.target.value })} className="mt-1">
                    {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </SelectNative>
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">{t.expenses.description} <span className="text-muted-foreground/60">{t.commandQuickExpense.optional}</span></label>
                <Input placeholder={t.expenses.whatDidYouPay} value={description} onChange={e => setDescription(e.target.value)} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">{t.expenses.category}</label>
                  <SelectNative value={defaults.category} onChange={e => setDefaults({ ...defaults, category: e.target.value })} className="mt-1">
                    {BUDGET_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </SelectNative>
                </div>
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">{t.expenses.payment}</label>
                  <SelectNative value={defaults.payment_method} onChange={e => setDefaults({ ...defaults, payment_method: e.target.value })} className="mt-1">
                    {PAYMENT_METHODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </SelectNative>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">{t.commandQuickExpense.hint}</p>
              <Button onClick={submit} className="w-full" disabled={!amount || busy}>
                {busy ? "..." : `${t.common.save} (${defaults.currency})`}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
      {/* ─── FAB stacking ───
         ExpenseFab vive ARRIBA en el stack (solo aparece en /expenses).
         bottom = safe-area + 216px (encima de MoreFab que está a 152, que a su
         vez está encima de AssistantFab a 88). Ver `more-fab.tsx` para el ASCII
         del stack completo. */}
      <button
        onClick={() => { haptic("light"); setOpen(true); }}
        aria-label={t.common.fabs.addExpense}
        title={t.commandQuickExpense.ctaShort}
        className="fixed z-40 right-4 w-14 h-14 rounded-2xl text-white shadow-[0_8px_24px_rgba(0,0,0,0.25),0_0_0_1px_rgba(255,255,255,0.10)_inset] bg-[linear-gradient(135deg,_oklch(0.68_0.16_38),_oklch(0.55_0.18_55))] hover:scale-105 hover:shadow-[0_12px_32px_rgba(0,0,0,0.30)] active:scale-95 transition-all flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
        style={{ bottom: "calc(var(--fab-stack-3) + env(safe-area-inset-bottom))" }}
      >
        <Plus className="w-6 h-6" aria-hidden="true" />
      </button>
    </>
  );
}
