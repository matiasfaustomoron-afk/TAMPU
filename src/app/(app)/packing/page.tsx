"use client";
import { useMemo, useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/shared";
import { useActiveTrip, useCities, usePackingItems, useMutations } from "@/lib/hooks/use-trip-data";
import { useI18n } from "@/i18n/provider";
import { PACKING_CATEGORIES } from "@/lib/config/constants";
import { suggestPackingItems, type PackingSuggestion } from "@/lib/domain/packing-templates";
import { haptic } from "@/lib/native/platform";
import { Check, ShoppingCart, AlertTriangle, Sparkles, Plus } from "lucide-react";
import type { PackingItem } from "@/lib/types/database";

export default function PackingPage() {
  const { t } = useI18n();
  const { data: trip } = useActiveTrip();
  const { data: cities } = useCities(trip?.id);
  const { data: items, loading, refetch } = usePackingItems(trip?.id);
  const { updatePackingItem, addPackingItem } = useMutations();
  const [showSuggestions, setShowSuggestions] = useState(false);

  const list = useMemo(() => items ?? [], [items]);
  const suggestions = useMemo<PackingSuggestion[]>(() => {
    if (!trip) return [];
    return suggestPackingItems(trip, list, (cities || []).map(c => c.name));
  }, [trip, list, cities]);

  const toggle = useCallback(async (i: PackingItem) => {
    const ns = i.status === "packed" ? "pending" : "packed";
    if (ns === "packed") haptic("selection"); // satisfying click-feel when packing an item
    await updatePackingItem(i.id, { status: ns, quantity_current: ns === "packed" ? i.quantity_target : 0 });
    refetch();
  }, [updatePackingItem, refetch]);

  const acceptSuggestion = useCallback(async (s: PackingSuggestion) => {
    if (!trip) return;
    await addPackingItem({
      trip_id: trip.id,
      category: s.category,
      subcategory: s.subcategory,
      item: s.item,
      quantity_target: s.quantity,
      quantity_current: 0,
      is_essential: s.is_essential,
      is_purchased: false,
      needs_purchase: true,
      assigned_bag: null,
      priority: s.is_essential ? "high" : "medium",
      status: "pending",
      deadline: null,
      notes: `Sugerido: ${s.reason}`,
    });
    refetch();
  }, [trip, addPackingItem, refetch]);

  const acceptAll = useCallback(async () => {
    if (!trip) return;
    for (const s of suggestions) await acceptSuggestion(s);
  }, [trip, suggestions, acceptSuggestion]);

  const grouped = useMemo(() => {
    const g: Record<string, PackingItem[]> = {};
    for (const i of list) {
      if (!g[i.category]) g[i.category] = [];
      g[i.category].push(i);
    }
    return g;
  }, [list]);

  const s = useMemo(() => ({
    total: list.length,
    packed: list.filter(i => i.status === "packed").length,
    essential: list.filter(i => i.is_essential).length,
    essentialPacked: list.filter(i => i.is_essential && i.status === "packed").length,
    needsPurchase: list.filter(i => i.needs_purchase && !i.is_purchased).length,
  }), [list]);

  if (loading) return <div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-24 bg-muted rounded-lg" />)}</div>;
  const pct = s.total > 0 ? Math.round((s.packed / s.total) * 100) : 0;

  return (
    <div className="space-y-4 pb-20 lg:pb-0 animate-fade-in">
      <SectionHeader
        title={t.packing.title}
        subtitle={`${s.packed}/${s.total} ${t.packing.packed} · ${s.essentialPacked}/${s.essential} ${t.packing.essential} · ${s.needsPurchase} ${t.packing.needPurchase}`}
        action={
          <Button size="sm" variant={showSuggestions ? "default" : "outline"} onClick={() => setShowSuggestions(!showSuggestions)} className="gap-1">
            <Sparkles className="w-4 h-4" />
            Sugerir ({suggestions.length})
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{t.packing.progress}</span>
            <span className="text-sm text-muted-foreground">{pct}%</span>
          </div>
          <Progress value={pct} className="h-2.5" indicatorClassName={pct === 100 ? "bg-success" : "bg-primary"} />
        </CardContent>
      </Card>

      {/* Dynamic suggestions panel */}
      {showSuggestions && (
        <Card className="border-l-4 border-l-primary">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />Sugerencias para tu destino</h3>
                <p className="text-[10px] text-muted-foreground">Basado en {trip?.destination} + duración + perfiles climáticos/sanitarios</p>
              </div>
              {suggestions.length > 0 && (
                <Button size="sm" variant="outline" onClick={acceptAll}>Agregar todas</Button>
              )}
            </div>
            {suggestions.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">Ya tenés cubiertas las sugerencias estándar para este destino.</p>
            ) : (
              <ul className="space-y-1.5">
                {suggestions.map((sug, i) => (
                  <li key={i} className="flex items-start gap-2 p-2 rounded-md bg-muted/20">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-medium">{sug.item}</p>
                        {sug.is_essential && <span className="text-[10px] text-destructive font-medium">esencial</span>}
                        <span className="text-[10px] text-muted-foreground">x{sug.quantity}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{sug.reason} · trigger: {sug.trigger}</p>
                    </div>
                    <button onClick={() => acceptSuggestion(sug)} className="shrink-0 p-1.5 rounded-md hover:bg-primary/10 text-primary">
                      <Plus className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {s.needsPurchase > 0 && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-primary"><ShoppingCart className="w-4 h-4" />{t.packing.needToBuy} ({s.needsPurchase})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {list.filter(i => i.needs_purchase && !i.is_purchased).map(i => (
                <div key={i.id} className="flex items-center gap-2 text-sm p-2 rounded bg-primary/5">
                  {i.is_essential && <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />}
                  <span className="flex-1">{i.item}</span>
                  <span className="text-xs text-muted-foreground capitalize">{i.category}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {Object.entries(grouped).sort().map(([cat, ci]) => {
        const cl = PACKING_CATEGORIES.find(c => c.value === cat)?.label || cat;
        const pk = ci.filter(i => i.status === "packed").length;
        const p = ci.length > 0 ? Math.round((pk / ci.length) * 100) : 0;
        return (
          <Card key={cat}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="capitalize">{cl}</CardTitle>
                <span className="text-xs text-muted-foreground">{pk}/{ci.length}</span>
              </div>
              <Progress value={p} className="h-1 mt-1" indicatorClassName={p === 100 ? "bg-success" : "bg-primary"} />
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {ci.sort((a, b) => (b.is_essential ? 1 : 0) - (a.is_essential ? 1 : 0)).map(i => (
                  <div key={i.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <button onClick={() => toggle(i)} className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${i.status === "packed" ? "bg-success border-success text-white" : "border-muted-foreground/30 hover:border-primary"}`}>
                      {i.status === "packed" && <Check className="w-3 h-3" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm ${i.status === "packed" ? "line-through text-muted-foreground" : ""}`}>{i.item}</span>
                      {i.quantity_target > 1 && <span className="text-[10px] text-muted-foreground ml-1">×{i.quantity_target}</span>}
                    </div>
                    <div className="shrink-0 flex items-center gap-1.5">
                      {i.is_essential && <span className="text-[10px] text-destructive font-medium">{t.criticality.essential}</span>}
                      {i.needs_purchase && !i.is_purchased && <ShoppingCart className="w-3 h-3 text-primary" />}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
