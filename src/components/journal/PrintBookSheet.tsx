"use client";

import { useState } from "react";
import { Sheet } from "@/components/ios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ios/toast";
import { reportError } from "@/lib/utils/errors";
import { BookOpen, Loader2 } from "lucide-react";
import { useI18n } from "@/i18n/provider";

/**
 * PrintBookSheet — UI wrapper para `/api/print-book`.
 *
 * Particularidad: el endpoint NO expone GET de estimate (su GET devuelve
 * órdenes existentes, no calcula precio). La estimación se computa en el mismo
 * POST que crea el draft. Por eso acá NO hacemos pre-fetch del precio — el
 * usuario ve un placeholder, confirma, y el server le devuelve precio + páginas
 * en el response del POST (que mostramos en el confirm toast).
 *
 * Si Peecho/Supabase no está configurado (503) lo manejamos graceful.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  tripId: string;
  tripName: string;
}

type Binding = "softcover" | "hardcover" | "lay-flat-premium";

export function PrintBookSheet({ open, onClose, tripId, tripName }: Props) {
  const { t } = useI18n();
  const BINDING_LABELS: Record<Binding, string> = {
    softcover: t.journal.printBook.bindings.softcover,
    hardcover: t.journal.printBook.bindings.hardcover,
    "lay-flat-premium": t.journal.printBook.bindings.lay_flat,
  };
  const [title, setTitle] = useState(`${t.journal.printBook.defaultTitlePrefix} ${tripName}`);
  const [binding, setBinding] = useState<Binding>("hardcover");
  const [ordering, setOrdering] = useState(false);

  async function handleOrder() {
    setOrdering(true);
    try {
      const res = await fetch("/api/print-book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          binding,
          title_override: title,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        estimate?: { pages: number; price_eur: number; binding: string };
      };
      if (!res.ok) {
        if (res.status === 401) {
          // Sesión perdida / cookie expirada. No spamear reportError con un
          // 401 — el user simplemente necesita re-loguearse antes de pedir.
          toast("Necesitás iniciar sesión para pedir un libro", "info");
          return;
        }
        if (res.status === 503) {
          toast("Configuración pendiente. Probá más tarde.", "warn");
        } else {
          toast(data.error || "No se pudo crear el pedido", "error");
        }
        return;
      }
      const est = data.estimate;
      const summary = est
        ? `Borrador guardado · ${est.pages}p · €${est.price_eur}`
        : "Borrador guardado.";
      toast(`${summary} Te avisamos cuando esté listo.`, "success");
      onClose();
    } catch (e) {
      reportError(e, "No se pudo crear el pedido");
    } finally {
      setOrdering(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Pedir libro físico">
      <div className="space-y-6 pb-4">
        <div className="flex items-start gap-3">
          <BookOpen className="w-8 h-8 text-primary shrink-0 mt-1" />
          <div>
            <h3 className="text-lg font-semibold">Tu viaje impreso en papel</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Cada foto + cada lugar del viaje en un libro. Envío a tu casa via
              partner Peecho (Amsterdam, 7-14 días).
            </p>
          </div>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Título
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Encuadernación
          </label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {(Object.keys(BINDING_LABELS) as Binding[]).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBinding(b)}
                className={`pressable p-3 rounded-lg border text-xs font-medium transition-colors ${
                  binding === b
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                {BINDING_LABELS[b]}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border p-4 bg-muted/30">
          <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted-foreground mb-1.5">
            Estimación
          </p>
          <p className="text-sm text-muted-foreground">
            El precio final depende del número de páginas y se calcula al
            confirmar el borrador. Envío mundial incluido (excl. customs).
          </p>
        </div>

        <Button
          className="w-full"
          onClick={handleOrder}
          disabled={ordering || !title.trim()}
        >
          {ordering ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Pidiendo...
            </span>
          ) : (
            "Confirmar pedido (borrador)"
          )}
        </Button>

        <p className="text-[11px] text-muted-foreground text-center">
          Es un borrador. Antes de imprimir te confirmamos el preview por email.
        </p>
      </div>
    </Sheet>
  );
}
