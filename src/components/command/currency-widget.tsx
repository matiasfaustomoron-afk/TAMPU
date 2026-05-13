"use client";

/**
 * Currency converter widget — shown in /expenses.
 *
 * Compact display: 1 USD = X EUR, X ARS oficial, X ARS blue, X BRL etc.
 * Click to expand/edit base currency. Pulls live rates via the converter hook,
 * falls back to offline reference rates when offline.
 */

import { useState, useMemo } from "react";
import { useExchangeRate, useArsRates, OFFLINE_USD_RATES } from "@/lib/currency/converter";
import { useI18n } from "@/i18n/provider";
import { SelectNative } from "@/components/ui/select-native";
import { CURRENCIES } from "@/lib/config/constants";
import { ArrowLeftRight, Wifi, WifiOff } from "lucide-react";

interface Props {
  /** Detected/active trip destination. Used to surface ARS rates when Argentina-relevant. */
  destination?: string;
  /** Base currency to show conversions FROM (typically the trip's base, e.g. USD). */
  defaultBase?: string;
}

/** Currencies shown in the widget by default. Includes both ARS variants for Argentina. */
const QUICK_TARGETS = ["EUR", "ARS", "BRL", "CLP", "MXN", "PEN", "KRW", "JPY"] as const;

export function CurrencyWidget({ destination, defaultBase = "USD" }: Props) {
  const { t, formatNumber } = useI18n();
  const [base, setBase] = useState(defaultBase);

  // Decide which targets to show. Argentina trips always show ARS blue.
  const isArgentinaTrip = destination?.toLowerCase().match(/(argentina|buenos aires|ushuaia|mendoza|córdoba|cordoba|bariloche)/);
  const targets = useMemo(() => {
    const base3 = QUICK_TARGETS.filter((c) => c !== base).slice(0, 4);
    if (isArgentinaTrip && !base3.includes("ARS")) base3.unshift("ARS");
    return base3;
  }, [base, isArgentinaTrip]);

  return (
    <div className="ios-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-muted-foreground flex items-center gap-1.5">
          <ArrowLeftRight className="w-3 h-3" /> {t.currency.title}
        </p>
        <SelectNative
          value={base}
          onChange={(e) => setBase(e.target.value)}
          className="!h-7 !text-[12px] !w-auto !py-0"
          aria-label="Base currency"
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              1 {c.code}
            </option>
          ))}
        </SelectNative>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {targets.map((to) => (
          <RateCell key={to} from={base} to={to} formatNumber={formatNumber} />
        ))}
        {isArgentinaTrip && <ArsBlueCell from={base} formatNumber={formatNumber} t={t} />}
      </div>
    </div>
  );
}

function RateCell({ from, to, formatNumber }: { from: string; to: string; formatNumber: (n: number) => string }) {
  const { rate, source, loading } = useExchangeRate(from, to);
  return (
    <div className="bg-muted/30 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
      <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">{to}</span>
      <span className="text-[13px] font-bold tabular-nums">
        {loading ? "…" : rate === null ? "—" : formatNumber(rate)}
      </span>
      {!loading && source === "offline" && (
        <WifiOff className="w-3 h-3 text-muted-foreground shrink-0" aria-label="offline" />
      )}
      {!loading && source === "live" && (
        <Wifi className="w-3 h-3 text-success/60 shrink-0" aria-label="live" />
      )}
    </div>
  );
}

function ArsBlueCell({
  from,
  formatNumber,
  t,
}: {
  from: string;
  formatNumber: (n: number) => string;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const { blue } = useArsRates(from);
  if (!blue) return null;
  return (
    <div className="bg-warning/10 rounded-xl px-3 py-2 flex items-center justify-between gap-2 border border-warning/20">
      <span className="text-[11px] font-semibold text-warning/80 tabular-nums">{t.currency.blueRate}</span>
      <span className="text-[13px] font-bold tabular-nums">{formatNumber(blue)}</span>
    </div>
  );
}

// re-export for callers that want raw access
export { OFFLINE_USD_RATES };
