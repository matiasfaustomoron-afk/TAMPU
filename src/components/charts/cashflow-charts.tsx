"use client";

// Cashflow charts extraídos a un módulo separado para lazy-load.
// Recharts pesa ~150KB minified; mantenerlo fuera del bundle inicial de
// /cashflow baja TTI en mobile. La page los importa via next/dynamic.

import { BarChart, Bar, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ComposedChart } from "recharts";

interface BucketPoint {
  date: string;
  out: number;
  cumulative: number;
  budget_line: number;
}

interface ChartsProps {
  data: BucketPoint[];
  formatCurrency: (n: number) => string;
}

export function DailyBurnBarChart({ data, formatCurrency }: ChartsProps) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
        <YAxis hide />
        <Tooltip
          formatter={(v) => formatCurrency(typeof v === "number" ? v : 0)}
          contentStyle={{
            fontSize: 11,
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
          }}
          cursor={{ fill: "var(--color-accent)", opacity: 0.4 }}
        />
        <Bar dataKey="out" fill="oklch(0.72 0.18 230)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CumulativeVsBudgetChart({ data, formatCurrency }: ChartsProps) {
  return (
    <ResponsiveContainer>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
        <YAxis hide />
        <Tooltip
          formatter={(v) => formatCurrency(typeof v === "number" ? v : 0)}
          contentStyle={{
            fontSize: 11,
            background: "var(--color-card)",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
          }}
        />
        <Line type="monotone" dataKey="budget_line" stroke="oklch(0.7 0.02 260)" strokeDasharray="4 4" dot={false} strokeWidth={2} />
        <Line type="monotone" dataKey="cumulative" stroke="oklch(0.72 0.18 230)" strokeWidth={2.5} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
