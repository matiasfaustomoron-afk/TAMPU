"use client";

import { useCallback, useMemo, useState } from "react";
import { Sheet } from "@/components/ios";
import { Button } from "@/components/ui/button";
import { Mail, Copy, Check, MessageCircle, ExternalLink } from "lucide-react";
import { getInboxAddress, tripShortId } from "@/lib/email-in/address";
import { haptic } from "@/lib/native/platform";
import { toast } from "@/components/ios/toast";
import type { Trip } from "@/lib/types/database";

interface Props {
  open: boolean;
  onClose: () => void;
  trip: Trip;
}

/**
 * <TripInboxAddressModal /> — sheet con la address per-trip + instrucciones de
 * forward + WhatsApp opcional.
 *
 * Diseño:
 *   - Address grande, mono, copy con feedback
 *   - 3 cards "cómo forwardear desde Gmail / Outlook / iOS Mail"
 *   - Si hay WhatsApp number configurado (env), card extra con deeplink wa.me
 *
 * Filo competitivo: TripIt te da `plans@tripit.com` para todos los viajes. Acá
 * cada trip tiene su address PROPIA — el user no tiene que decirle a Tampu "esto
 * es para Seúl", la address lo identifica.
 */
export function TripInboxAddressModal({ open, onClose, trip }: Props) {
  const address = useMemo(() => getInboxAddress(trip.id), [trip.id]);
  const shortId = useMemo(() => tripShortId(trip.id), [trip.id]);
  const whatsappNumber = process.env.NEXT_PUBLIC_TAMPU_WHATSAPP_NUMBER || null;

  const [copied, setCopied] = useState(false);

  const copyAddress = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast("Clipboard no disponible", "warn");
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      haptic("light");
      setCopied(true);
      toast("Address copiada", "success");
      setTimeout(() => setCopied(false), 2200);
    } catch {
      toast("No se pudo copiar", "warn");
    }
  }, [address]);

  return (
    <Sheet open={open} onClose={onClose} title="Tu address del viaje">
      <div className="space-y-4 pb-2 animate-fade-in">
        {/* Address card */}
        <div className="ios-card p-4">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-2xl tampu-icon tampu-icon-indigo flex items-center justify-center shrink-0">
              <Mail className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-muted-foreground mb-1">
                Forwardeá emails a
              </p>
              <p className="font-mono text-[14.5px] font-semibold break-all leading-tight select-all">
                {address}
              </p>
              <p className="text-[11.5px] text-muted-foreground mt-1.5">
                Short ID: <span className="font-mono">{shortId}</span> · viaje{" "}
                <span className="text-foreground font-medium">{trip.name}</span>
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button onClick={copyAddress} size="sm" className="gap-1.5">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? "Copiado" : "Copiar"}
            </Button>
            <a
              href={`mailto:${address}?subject=Test%20Tampu&body=Hola%2C%20esto%20es%20un%20test%20de%20mi%20address.`}
              className="pressable inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-[12px] font-semibold text-foreground"
            >
              Mandar test
            </a>
          </div>
        </div>

        {/* WhatsApp channel (si está configurado) */}
        {whatsappNumber && (
          <div className="ios-card p-4">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-2xl tampu-icon tampu-icon-cardon flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-muted-foreground mb-1">
                  O por WhatsApp
                </p>
                <p className="text-[14.5px] font-semibold break-all leading-tight">
                  {whatsappNumber}
                </p>
                <p className="text-[11.5px] text-muted-foreground mt-1">
                  Reenviá la confirmación al chat y aparece en tu bandeja.
                </p>
              </div>
            </div>
            <div className="mt-3">
              <a
                href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}`}
                target="_blank"
                rel="noreferrer noopener"
                className="pressable inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-success/15 text-success text-[12px] font-semibold"
              >
                Abrir WhatsApp <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-muted-foreground px-1">
            Cómo forwardear
          </p>

          <details className="ios-card p-3" open>
            <summary className="cursor-pointer list-none flex items-center gap-2 text-[13px] font-semibold">
              <span className="text-lg">📧</span> Gmail (web / Android / iOS)
            </summary>
            <ol className="mt-2 pl-7 space-y-1 text-[12px] text-muted-foreground leading-relaxed list-decimal">
              <li>Abrí el email de confirmación (vuelo, hotel, tour, etc.).</li>
              <li>Tap en los <strong>tres puntos</strong> arriba a la derecha → <strong>Reenviar</strong>.</li>
              <li>En el destinatario pegá <span className="font-mono text-foreground">{address}</span>.</li>
              <li>Enviá. En 30 segundos aparece en tu Bandeja del viaje.</li>
            </ol>
          </details>

          <details className="ios-card p-3">
            <summary className="cursor-pointer list-none flex items-center gap-2 text-[13px] font-semibold">
              <span className="text-lg">📨</span> Outlook (web / app)
            </summary>
            <ol className="mt-2 pl-7 space-y-1 text-[12px] text-muted-foreground leading-relaxed list-decimal">
              <li>Abrí el email → barra superior → <strong>Reenviar</strong> (icono flecha).</li>
              <li>Pegá <span className="font-mono text-foreground">{address}</span> en &quot;Para&quot;.</li>
              <li>Mandalo tal cual, sin texto extra.</li>
            </ol>
          </details>

          <details className="ios-card p-3">
            <summary className="cursor-pointer list-none flex items-center gap-2 text-[13px] font-semibold">
              <span className="text-lg">📱</span> iOS Mail (iPhone)
            </summary>
            <ol className="mt-2 pl-7 space-y-1 text-[12px] text-muted-foreground leading-relaxed list-decimal">
              <li>Abrí el email → flecha curva abajo a la derecha → <strong>Reenviar</strong>.</li>
              <li>Pegá <span className="font-mono text-foreground">{address}</span> en el campo &quot;Para&quot;.</li>
              <li>Tocá <strong>Enviar</strong> arriba a la derecha.</li>
            </ol>
          </details>

          <details className="ios-card p-3">
            <summary className="cursor-pointer list-none flex items-center gap-2 text-[13px] font-semibold">
              <span className="text-lg">⚡</span> Reenvío automático (avanzado)
            </summary>
            <p className="mt-2 pl-7 text-[12px] text-muted-foreground leading-relaxed">
              Podés crear un filtro en Gmail que reenvíe automáticamente todos los emails de
              dominios como <span className="font-mono">@latam.com</span>, <span className="font-mono">@booking.com</span>{" "}
              o <span className="font-mono">@airbnb.com</span> a tu address. Así no tenés que reenviar manualmente.
            </p>
          </details>
        </div>

        <div className="ios-card p-3 bg-warning/8 border border-warning/30">
          <p className="text-[11.5px] text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Privacidad:</strong> nunca guardamos el cuerpo crudo del email,
            solo el resultado parseado (proveedor, fecha, monto, localizador). Podés
            revisar cada item en /inbox antes de importarlo al viaje.
          </p>
        </div>
      </div>
    </Sheet>
  );
}
