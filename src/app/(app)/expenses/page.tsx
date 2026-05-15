"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { LargeTitle, IOSFeatureCard, Pill, Sheet, StatChip } from "@/components/ios";
import { EmptyState } from "@/components/shared";
import { useActiveTrip, useExpenses, useMutations, useBudgetSummary, useBudgetCategories } from "@/lib/hooks/use-trip-data";
import { useI18n } from "@/i18n/provider";
import { formatCurrencyDetailed } from "@/lib/utils/helpers";
import { BUDGET_CATEGORIES, CURRENCIES, PAYMENT_METHODS } from "@/lib/config/constants";
import { encodeSplitToNotes, parseSplitFromNotes } from "@/lib/domain/split";
import { convert } from "@/lib/currency-rates";
import { toast } from "@/components/ios/toast";
import { useConfirmSheet } from "@/lib/hooks/use-confirm-sheet";
import { haptic } from "@/lib/native/platform";
import { Receipt, Plus, Trash2, Users, Filter, PieChart as PieChartIcon, Target } from "lucide-react";
import { cn } from "@/lib/utils/helpers";
import { ExpenseFab } from "@/components/command/expense-fab";
import { CurrencyWidget } from "@/components/command/currency-widget";
import { categorizeExpense } from "@/lib/ai/expense-categorizer";
import { Sparkles } from "lucide-react";
import { useCountUp } from "@/lib/hooks/use-count-up";
import dynamic from "next/dynamic";

// Lazy-load donut chart (Recharts is ~140KB; only loaded when this page renders)
const CategoryDonut = dynamic(() => import("@/components/charts/category-donut").then(m => m.CategoryDonut), {
  ssr: false,
  loading: () => <div className="ios-card h-44 skeleton" />,
});

// Paleta tierra Tampu — 12 categorías cubiertas por 8 tokens.
// Las repeticiones son intencionales: gastos relacionados comparten familia visual
// (comida=terracota, transporte/vuelos=cobre, alojamiento=cardón, etc.).
const CATEGORY_ACCENT: Record<string, string> = {
  food:          "tampu-icon tampu-icon-terracota",
  transport:     "tampu-icon tampu-icon-cobre",
  accommodation: "tampu-icon tampu-icon-cardon",
  activities:    "tampu-icon tampu-icon-indigo",
  shopping:      "tampu-icon tampu-icon-canela",
  insurance:     "tampu-icon tampu-icon-cardon",
  flights:       "tampu-icon tampu-icon-cobre",
  visas:         "tampu-icon tampu-icon-mostaza",
  health:        "tampu-icon tampu-icon-carmin",
  connectivity:  "tampu-icon tampu-icon-indigo",
  other:         "tampu-icon tampu-icon-piedra",
  contingency:   "tampu-icon tampu-icon-piedra",
};


export default function ExpensesPage() {
  const { t, formatCurrency, formatDate } = useI18n();
  // i18n-aware label lookup for budget categories. Fallback to the constant's static
  // label if the dictionary key is missing (so future categories don't break the UI).
  const catLabel = useCallback(
    (value: string, fallback: string) =>
      (t.budgetCategories as Record<string, string | undefined>)[value] ?? fallback,
    [t.budgetCategories],
  );
  const { data: trip, refetch: refetchTrip } = useActiveTrip();
  const { data: expenses, loading, refetch } = useExpenses(trip?.id);
  const { data: budget } = useBudgetSummary();
  const { data: budgetCategories, refetch: refetchCategories } = useBudgetCategories(trip?.id);
  const { addExpense, deleteExpense, updateTrip, saveBudgetByCategories } = useMutations();
  const { confirm, sheet: confirmSheet } = useConfirmSheet();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [budgetSheetOpen, setBudgetSheetOpen] = useState(false);
  const [filterCat, setFilterCat] = useState<string>("all");

  // ─── Budget edit form state ───
  // Por categoría: un objeto {category → monto editable}. Se inicializa al abrir el sheet
  // mezclando lo guardado (budgetCategories de la DB) con BUDGET_CATEGORIES (constants).
  // Las categorías que el usuario nunca tocó arrancan con monto 0.
  const [budgetByCat, setBudgetByCat] = useState<Record<string, string>>({});
  const [contingencyEdit, setContingencyEdit] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);

  // Categorías que se muestran en el sheet — todas menos "contingency" (se gestiona aparte
  // como % del total) y "other" se queda al final.
  const BUDGET_CATS_VISIBLE = useMemo(
    () => BUDGET_CATEGORIES.filter(c => c.value !== "contingency"),
    []
  );

  const openBudgetSheet = useCallback(() => {
    if (!trip) return;
    // Construir mapa inicial: si la categoría tiene fila en budget_categories, usar ese monto;
    // si no, vacío (placeholder "0" en input).
    const saved = budgetCategories ?? [];
    const initial: Record<string, string> = {};
    for (const c of BUDGET_CATS_VISIBLE) {
      const found = saved.find(s => s.category === c.value);
      initial[c.value] = found && found.budgeted_amount > 0 ? String(found.budgeted_amount) : "";
    }
    setBudgetByCat(initial);
    setContingencyEdit(String(trip.contingency_percent || 10));
    setBudgetSheetOpen(true);
  }, [trip, budgetCategories, BUDGET_CATS_VISIBLE]);

  // Total objetivo derivado en vivo del input
  const budgetTotalLive = useMemo(
    () => Object.values(budgetByCat).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [budgetByCat]
  );
  const contingencyLive = Math.max(0, Math.min(50, parseInt(contingencyEdit, 10) || 0));
  const contingencyAmountLive = Math.round((budgetTotalLive * contingencyLive) / 100);
  const budgetWithContingencyLive = budgetTotalLive + contingencyAmountLive;

  const saveBudget = useCallback(async () => {
    if (!trip) return;
    setSavingBudget(true);
    try {
      // 1) Persistir cada categoría (solo las que tienen monto > 0 — las vacías se omiten;
      //    si querés bajar a 0 una categoría existente, la pones en 0 explícitamente).
      const rows = BUDGET_CATS_VISIBLE.map((c, idx) => ({
        category: c.value,
        label: c.label,
        budgeted_amount: parseFloat(budgetByCat[c.value] || "0") || 0,
        order_index: idx,
      }));
      await saveBudgetByCategories(trip.id, rows);

      // 2) Actualizar el total del trip (suma de categorías) + contingencia.
      await updateTrip(trip.id, {
        total_budget: budgetTotalLive,
        contingency_percent: contingencyLive,
        contingency_amount: contingencyAmountLive,
      });

      haptic("medium");
      toast(`Presupuesto guardado · ${formatCurrencyDetailed(budgetWithContingencyLive)}`, "success");
      setBudgetSheetOpen(false);
      refetchTrip();
      refetchCategories();
      refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "No se pudo guardar", "error");
    } finally {
      setSavingBudget(false);
    }
  }, [
    trip, budgetByCat, contingencyLive, budgetTotalLive, contingencyAmountLive,
    budgetWithContingencyLive, updateTrip, saveBudgetByCategories,
    refetchTrip, refetchCategories, refetch, BUDGET_CATS_VISIBLE,
  ]);

  // Form state
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [category, setCategory] = useState("food");
  const [description, setDescription] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("credit_card_black");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [splitOn, setSplitOn] = useState(false);
  const [splitPaidBy, setSplitPaidBy] = useState("Yo");
  const [splitWith, setSplitWith] = useState("");

  // ─── QW6: Auto-categorize con LLM ───
  // El user escribe en `description` y después de 800ms sin tocar el input,
  // pedimos al LLM una categoría. Solo si el user NO tocó manualmente el
  // select (manualCategoryRef). Indicador "✨ Categorizado por IA" cuando termina.
  const [aiCategorizing, setAiCategorizing] = useState(false);
  const [aiCategorized, setAiCategorized] = useState(false);
  const manualCategoryRef = useRef(false);

  // Si el user cambia manualmente la categoría, paramos las auto-sugerencias
  const handleCategoryChange = (v: string) => {
    manualCategoryRef.current = true;
    setCategory(v);
    setAiCategorized(false);
  };

  useEffect(() => {
    if (!description || description.trim().length < 3) {
      setAiCategorized(false);
      return;
    }
    if (manualCategoryRef.current) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      setAiCategorizing(true);
      const result = await categorizeExpense({
        description,
        amount: amount ? parseFloat(amount) : undefined,
        currency,
        date,
        destination: trip?.destination ?? undefined,
      }, ctrl.signal);
      setAiCategorizing(false);
      if (!result || manualCategoryRef.current) return;
      if (result.confidence !== "low") {
        setCategory(result.category);
        setAiCategorized(true);
      }
    }, 800);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [description, amount, currency, date, trip?.destination]);

  // Reset manual flag al cerrar el sheet — el user puede agregar otro gasto distinto
  const resetCategorizer = useCallback(() => {
    manualCategoryRef.current = false;
    setAiCategorized(false);
  }, []);

  const list = useMemo(() => expenses ?? [], [expenses]);
  const totalSpent = useMemo(() => list.reduce((s, e) => s + e.base_amount, 0), [list]);
  const filtered = useMemo(() => {
    let r = [...list].sort((a, b) => b.date.localeCompare(a.date));
    if (filterCat !== "all") r = r.filter(e => e.category === filterCat);
    return r;
  }, [list, filterCat]);

  // Group by day
  const grouped = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    for (const e of filtered) {
      const arr = m.get(e.date) || [];
      arr.push(e);
      m.set(e.date, arr);
    }
    return Array.from(m.entries()); // already sorted desc due to filtered
  }, [filtered]);

  const handleSubmit = useCallback(async () => {
    if (!amount || !description || !trip) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return;
    let notes: string | null = null;
    if (splitOn) {
      const others = splitWith.split(",").map(s => s.trim()).filter(Boolean);
      const shared_with = Array.from(new Set([splitPaidBy.trim() || "Yo", ...others]));
      if (shared_with.length >= 2) {
        notes = encodeSplitToNotes(null, { paid_by: splitPaidBy.trim() || "Yo", shared_with });
      }
    }
    // Live FX conversion to the trip's base currency
    const base = trip.base_currency || "USD";
    let exchange_rate = 1;
    let base_amount = amt;
    if (currency !== base) {
      const conv = await convert(amt, currency, base);
      if (conv) {
        exchange_rate = conv.rate;
        base_amount = Math.round(conv.value * 100) / 100;
      }
    }
    await addExpense({
      trip_id: trip.id, date, city_id: null, city_name: null, category, subcategory: null,
      description, payment_method: paymentMethod, original_currency: currency,
      original_amount: amt, exchange_rate, base_amount,
      is_fixed: false, is_budgeted: true, reservation_id: null, attachment_url: null, notes,
    });
    setAmount(""); setDescription(""); setSheetOpen(false);
    setSplitOn(false); setSplitWith("");
    resetCategorizer();
    haptic("medium");
    toast(`Cargado · ${formatCurrency(amt)} a ${category}`, "success");
    refetch();
  }, [amount, description, trip, date, category, paymentMethod, currency, addExpense, refetch, splitOn, splitPaidBy, splitWith, formatCurrency, resetCategorizer]);

  const handleDelete = useCallback(async (id: string) => {
    const ok = await confirm({
      title: "¿Eliminar este gasto?",
      message: "Esta acción no se puede deshacer.",
      destructive: true,
    });
    if (!ok) return;
    await deleteExpense({ id, tripId: trip?.id });
    toast("Gasto eliminado", "info");
    refetch();
  }, [deleteExpense, refetch, trip?.id, confirm]);

  // ─── HOOKS ORDER: useCountUp DEBE llamarse SIEMPRE antes del early return ───
  // Previous bug: useCountUp estaba después del `if (loading) return` → cuando
  // loading cambiaba true→false, el hook count variaba (hook order error React).
  // Fix: compute pct sin requerir loading=false, call useCountUp incondicional.
  const totalBudget = budget?.total_budget ?? trip?.total_budget ?? 0;
  const pct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const animatedPct = useCountUp(pct, { durationMs: 900 });

  if (loading) return <ExpensesSkeleton />;

  const remaining = Math.max(0, totalBudget - totalSpent);
  const status: "ok" | "warn" | "alert" = pct < 75 ? "ok" : pct < 95 ? "warn" : "alert";
  const today = new Date().toISOString().split("T")[0];
  const spentToday = list.filter(e => e.date === today).reduce((s, e) => s + e.base_amount, 0);
  const avgPerDay = list.length > 0 ? totalSpent / Math.max(1, new Set(list.map(e => e.date)).size) : 0;

  // Status gradient — paleta tierra Tampu (no indigo SaaS).
  // ok = terracota/cobre, warn = sol pampa/mostaza, alert = carmín.
  const heroGradient =
    status === "alert" ? "linear-gradient(135deg, oklch(0.55 0.20 25), oklch(0.42 0.18 18))" :
    status === "warn"  ? "linear-gradient(135deg, oklch(0.62 0.15 70), oklch(0.50 0.16 55))" :
                         "linear-gradient(135deg, oklch(0.62 0.16 38), oklch(0.45 0.16 55))";

  return (
    <div className="animate-fade-in" role="region" aria-label="Gastos del viaje">
      <LargeTitle
        eyebrow={`${list.length} ${list.length === 1 ? "gasto" : "gastos"} cargados`}
        title="Dinero"
        serif
        action={
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={openBudgetSheet}
              className="gap-1"
              aria-label="Editar presupuesto objetivo del viaje"
            >
              <Target className="w-4 h-4" /> Presupuesto
            </Button>
            <Button size="sm" onClick={() => setSheetOpen(true)} className="gap-1">
              <Plus className="w-4 h-4" /> Gasto
            </Button>
          </div>
        }
      />

      {/* Hero: budget feature card */}
      <div className="px-4">
        <IOSFeatureCard gradient={heroGradient} className="text-white" padding="xl">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/70">
            Gastado del presupuesto
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="font-serif text-[56px] sm:text-[64px] leading-none tabular-nums">
              {animatedPct}<span className="text-white/60 text-3xl">%</span>
            </p>
          </div>
          <p className="text-sm text-white/80 mt-2 tabular-nums">
            {formatCurrency(totalSpent)} <span className="opacity-60">de</span> {formatCurrency(totalBudget)}
          </p>
          {/* Progress bar */}
          <div className="mt-4 h-1.5 rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all duration-700"
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3 text-white">
            <MiniStat label="Restante" value={formatCurrency(remaining)} />
            <MiniStat label="Hoy" value={formatCurrency(spentToday)} />
            <MiniStat label="Promedio / día" value={formatCurrency(avgPerDay)} />
          </div>
        </IOSFeatureCard>
      </div>

      {/* Currency converter widget — quick FX reference for travelers */}
      <section className="px-4 mt-6">
        <CurrencyWidget
          destination={trip?.destination}
          defaultBase={trip?.base_currency || "USD"}
        />
      </section>

      {/* Donut chart — clickable categories filter the list below */}
      {list.length > 0 && (
        <section className="px-4 mt-6">
          <p className="ios-eyebrow flex items-center gap-1.5">
            <PieChartIcon className="w-3.5 h-3.5" /> Por categoría
          </p>
          <CategoryDonut
            expenses={list}
            categoriesLabel={Object.fromEntries(BUDGET_CATEGORIES.map(c => [c.value, catLabel(c.value, c.label)]))}
            activeCategory={filterCat}
            onSliceClick={(cat) => setFilterCat(filterCat === cat ? "all" : cat)}
            formatCurrency={formatCurrency}
          />
        </section>
      )}

      {/* Quick stats row */}
      <section className="px-4 mt-6">
        <p className="ios-eyebrow">Resumen</p>
        <div className="ios-card p-5 grid grid-cols-3 gap-4">
          <StatChip label="Forecast" value={budget ? formatCurrency(budget.forecast_total) : "—"}
            status={budget?.forecast_status === "red" ? "alert" : budget?.forecast_status === "yellow" ? "warn" : "ok"} />
          <StatChip label="Pagos" value={budget ? formatCurrency(budget.total_committed) : "—"} />
          <StatChip label="Categorías" value={new Set(list.map(e => e.category)).size} />
        </div>
      </section>

      {/* Category chips */}
      <section className="px-4 mt-6">
        <div className="flex items-center justify-between mb-2">
          <p className="ios-eyebrow !p-0">Filtrar</p>
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
          <FilterChip active={filterCat === "all"} onClick={() => setFilterCat("all")}>Todos</FilterChip>
          {BUDGET_CATEGORIES.filter(c => c.value !== "contingency").map(c => (
            <FilterChip key={c.value} active={filterCat === c.value} onClick={() => setFilterCat(c.value)}>
              {catLabel(c.value, c.label)}
            </FilterChip>
          ))}
        </div>
      </section>

      {/* Expenses list — grouped by day */}
      {filtered.length === 0 ? (
        <div className="mt-12">
          <EmptyState
            title="Sin gastos cargados"
            description="Tocá + para agregar el primero. Se guarda al instante."
            icon={<Receipt className="w-8 h-8" />}
            action={<Button onClick={() => setSheetOpen(true)}>Agregar gasto</Button>}
          />
        </div>
      ) : (
        <div className="mt-6">
          {grouped.map(([day, items]) => {
            const dayTotal = items.reduce((s, e) => s + e.base_amount, 0);
            const isToday = day === today;
            return (
              <section key={day} className="px-4 mb-6">
                <div className="flex items-baseline justify-between mb-2 px-1">
                  <p className="text-[11px] font-bold tracking-[0.10em] uppercase text-muted-foreground">
                    {isToday ? "Hoy" : formatDate(day, "long")}
                  </p>
                  <p className="text-[11px] tabular-nums text-muted-foreground">{formatCurrency(dayTotal)}</p>
                </div>
                <div className="ios-list">
                  {items.map(e => {
                    const split = parseSplitFromNotes(e.notes);
                    return (
                      <div key={e.id} className="ios-list-row group">
                        <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                          CATEGORY_ACCENT[e.category] || "bg-muted text-muted-foreground")}>
                          <Receipt className="w-4 h-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] font-medium leading-tight truncate flex items-center gap-1.5">
                            {e.description}
                            {split && <Users className="w-3 h-3 text-primary" aria-label="Compartido" />}
                          </p>
                          <p className="text-[12px] text-muted-foreground capitalize mt-0.5">
                            {e.category}
                            {e.original_currency !== "USD" && (
                              <> · {e.original_currency} {e.original_amount.toLocaleString()}</>
                            )}
                            {split && <> · Split {split.shared_with.length}p</>}
                          </p>
                        </div>
                        <span className="text-[15px] font-semibold tabular-nums shrink-0">
                          {formatCurrencyDetailed(e.base_amount)}
                        </span>
                        <button
                          onClick={() => handleDelete(e.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all"
                          aria-label="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Add-expense bottom sheet */}
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Nuevo gasto">
        <div className="space-y-4 pb-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Monto</label>
              <Input type="number" inputMode="decimal" placeholder="0.00" value={amount}
                onChange={e => setAmount(e.target.value)} className="mt-1 text-2xl font-bold tabular-nums h-14"
                autoFocus />
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Moneda</label>
              <SelectNative value={currency} onChange={e => setCurrency(e.target.value)} className="mt-1 h-14">
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
              </SelectNative>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase text-muted-foreground tracking-wider">En qué</label>
            <Input placeholder={t.expenses.whatDidYouPay} value={description}
              onChange={e => setDescription(e.target.value)} className="mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                Categoría
                {aiCategorizing && <span className="text-[9px] text-muted-foreground italic">pensando…</span>}
                {aiCategorized && !aiCategorizing && (
                  <span className="text-[9px] text-primary inline-flex items-center gap-0.5">
                    <Sparkles className="w-2.5 h-2.5" />Categorizado por IA
                  </span>
                )}
              </label>
              <SelectNative value={category} onChange={e => handleCategoryChange(e.target.value)} className="mt-1">
                {BUDGET_CATEGORIES.map(c => <option key={c.value} value={c.value}>{catLabel(c.value, c.label)}</option>)}
              </SelectNative>
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Pago</label>
              <SelectNative value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="mt-1">
                {PAYMENT_METHODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </SelectNative>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Fecha</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
          </div>

          <div className="border-t border-border pt-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={splitOn} onChange={e => setSplitOn(e.target.checked)} className="w-4 h-4" />
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-medium">Compartido</span>
            </label>
            {splitOn && (
              <div className="grid grid-cols-2 gap-2 mt-2 pl-6">
                <Input value={splitPaidBy} onChange={e => setSplitPaidBy(e.target.value)} placeholder="Pagó: Yo" />
                <Input value={splitWith} onChange={e => setSplitWith(e.target.value)} placeholder="Con: Ana, Juan" />
              </div>
            )}
          </div>

          <Button onClick={handleSubmit} size="lg" className="w-full mt-2"
            disabled={!amount || !description}>
            Guardar gasto
          </Button>
        </div>
      </Sheet>

      {/* ─── Budget edit sheet — presupuesto POR CATEGORÍA + contingencia ─── */}
      <Sheet open={budgetSheetOpen} onClose={() => setBudgetSheetOpen(false)} title="Presupuesto del viaje">
        <div className="space-y-4 pb-2">
          <div className="ios-card p-4 bg-primary/5 border border-primary/20">
            <p className="text-[11px] font-bold tracking-[0.12em] uppercase text-primary mb-1">
              Asigná cuánto pensás gastar por categoría
            </p>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              Ponele un monto a las que pensás usar (vuelos, hoteles, comida…). Las que dejes
              vacías quedan en 0. Tampu calcula el total y suma <strong>{contingencyLive}%</strong> de
              contingencia para imprevistos.
            </p>
          </div>

          {/* Lista de categorías editables */}
          <div className="space-y-2">
            {BUDGET_CATS_VISIBLE.map((c) => {
              const accent = CATEGORY_ACCENT[c.value] || "tampu-icon tampu-icon-piedra";
              const value = budgetByCat[c.value] ?? "";
              const numValue = parseFloat(value) || 0;
              return (
                <div key={c.value} className="ios-card p-3 flex items-center gap-3">
                  <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", accent)}>
                    <Receipt className="w-4 h-4" aria-hidden />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold leading-tight">{catLabel(c.value, c.label)}</p>
                    {numValue > 0 && (
                      <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                        {formatCurrencyDetailed(numValue)}
                      </p>
                    )}
                  </div>
                  <div className="w-28 shrink-0">
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={value}
                      onChange={(e) =>
                        setBudgetByCat((prev) => ({ ...prev, [c.value]: e.target.value }))
                      }
                      placeholder="0"
                      className="text-right tabular-nums h-10"
                      aria-label={`Presupuesto para ${catLabel(c.value, c.label)}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total + contingencia */}
          <div className="pt-2 border-t border-border/40">
            <div className="flex items-center justify-between py-2">
              <span className="text-[13px] text-muted-foreground">Subtotal por categorías</span>
              <span className="text-[16px] font-semibold tabular-nums">
                {formatCurrencyDetailed(budgetTotalLive)}
              </span>
            </div>

            <div className="flex items-center gap-3 py-2">
              <span className="text-[13px] text-muted-foreground flex-1">
                Contingencia ({contingencyLive}%)
              </span>
              <Input
                type="number"
                inputMode="numeric"
                value={contingencyEdit}
                onChange={(e) => setContingencyEdit(e.target.value)}
                className="w-20 text-right tabular-nums h-10"
                placeholder="10"
                aria-label="Porcentaje de contingencia"
              />
              <span className="text-[14px] font-semibold tabular-nums w-24 text-right">
                {formatCurrencyDetailed(contingencyAmountLive)}
              </span>
            </div>

            {/* Total grande */}
            <div className="ios-card p-4 mt-2 bg-primary/8 border border-primary/30">
              <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-primary">
                Presupuesto total
              </p>
              <p className="text-[28px] font-bold tabular-nums mt-1">
                {formatCurrencyDetailed(budgetWithContingencyLive)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {trip?.base_currency || "USD"} · suma de categorías + contingencia
              </p>
            </div>
          </div>

          <Button
            onClick={saveBudget}
            size="lg"
            className="w-full mt-2"
            disabled={savingBudget || budgetTotalLive <= 0}
          >
            {savingBudget ? "Guardando…" : "Guardar presupuesto"}
          </Button>
          {budgetTotalLive <= 0 && (
            <p className="text-[11px] text-muted-foreground text-center">
              Cargá al menos una categoría para guardar
            </p>
          )}
        </div>
      </Sheet>

      {/* Status pill for accessibility (announces state to SR users) */}
      <span className="sr-only">Estado: {status === "ok" ? "saludable" : status === "warn" ? "cuidado" : "excedido"}</span>
      <Pill tone={status} className="sr-only">{pct}%</Pill>

      {/* FAB de gasto rápido — solo dentro de /expenses (regla iOS HIG: tab bar global solo navega).
          El layout global ya monta el AssistantFab transversal. Acá agregamos el ExpenseFab
          contextual a esta página. */}
      <ExpenseFab />
      {confirmSheet}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "pressable shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-colors",
        active ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"
      )}
    >
      {children}
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-wider uppercase text-white/60 mb-1 truncate">{label}</p>
      <p className="text-[14px] font-bold tabular-nums truncate">{value}</p>
    </div>
  );
}

function ExpensesSkeleton() {
  return (
    <div className="animate-fade-in">
      <div className="px-5 pt-4 pb-5">
        <div className="h-3 w-32 skeleton rounded mb-2" />
        <div className="h-10 w-32 skeleton rounded-xl" />
      </div>
      <div className="px-4"><div className="h-52 rounded-[var(--radius-xl)] skeleton" /></div>
      <div className="px-4 mt-6 space-y-2">
        {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-[var(--radius)] skeleton" />)}
      </div>
    </div>
  );
}
