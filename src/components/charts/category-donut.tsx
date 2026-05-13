"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils/helpers";

// Solid HEX colors for the donut slices
const CATEGORY_HEX: Record<string, string> = {
  food: "#fb923c",
  transport: "#3b82f6",
  accommodation: "#10b981",
  activities: "#a855f7",
  shopping: "#ec4899",
  insurance: "#06b6d4",
  flights: "#0ea5e9",
  visas: "#f59e0b",
  health: "#ef4444",
  connectivity: "#6366f1",
  other: "#71717a",
  contingency: "#a1a1aa",
};

export function CategoryDonut({
  expenses, categoriesLabel, activeCategory, onSliceClick, formatCurrency,
}: {
  expenses: { category: string; base_amount: number }[];
  categoriesLabel: Record<string, string>;
  activeCategory: string;
  onSliceClick: (cat: string) => void;
  formatCurrency: (n: number) => string;
}) {
  const agg = new Map<string, number>();
  for (const e of expenses) agg.set(e.category, (agg.get(e.category) ?? 0) + e.base_amount);
  const data = Array.from(agg.entries())
    .map(([category, value]) => ({
      category,
      value,
      label: categoriesLabel[category] || category,
      color: CATEGORY_HEX[category] || "#71717a",
    }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = data.reduce((s, d) => s + d.value, 0);
  const active = data.find(d => d.category === activeCategory);

  return (
    <div className="ios-card p-5">
      <div className="flex items-center gap-4">
        <div className="relative w-[140px] h-[140px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="category"
                innerRadius={42}
                outerRadius={62}
                paddingAngle={2}
                stroke="none"
                onClick={(d) => {
                  const cat = (d as unknown as { category?: string }).category;
                  if (cat) onSliceClick(cat);
                }}
                style={{ cursor: "pointer" }}
              >
                {data.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.color}
                    stroke={entry.category === activeCategory ? "rgba(255,255,255,0.9)" : "none"}
                    strokeWidth={entry.category === activeCategory ? 3 : 0}
                    opacity={activeCategory === "all" || entry.category === activeCategory ? 1 : 0.4}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {active ? (
              <>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{active.label}</p>
                <p className="text-base font-bold tabular-nums leading-none mt-0.5">
                  {Math.round((active.value / total) * 100)}%
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                  {formatCurrency(active.value)}
                </p>
              </>
            ) : (
              <>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Total</p>
                <p className="text-lg font-bold tabular-nums leading-none mt-0.5">
                  {formatCurrency(total)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {data.length} categorías
                </p>
              </>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          {data.slice(0, 5).map(d => {
            const isActive = d.category === activeCategory;
            const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
            return (
              <button
                key={d.category}
                onClick={() => onSliceClick(d.category)}
                className={cn(
                  "pressable w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all text-left",
                  isActive ? "bg-muted/80" : "hover:bg-muted/40"
                )}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                <span className="text-[12.5px] font-medium truncate flex-1">{d.label}</span>
                <span className="text-[11.5px] tabular-nums text-muted-foreground shrink-0">
                  {pct}%
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-[10.5px] text-muted-foreground mt-3 text-center">
        {activeCategory === "all"
          ? "Tocá una categoría para filtrar la lista"
          : `Mostrando solo: ${categoriesLabel[activeCategory] || activeCategory} · tocá de nuevo para ver todos`}
      </p>
    </div>
  );
}
