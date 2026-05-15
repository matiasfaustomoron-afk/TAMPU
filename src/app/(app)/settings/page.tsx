"use client";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/shared";
import {
  useActiveTrip,
  useReservations,
  useTripDays,
  useDocuments,
  useBudgetSummary,
} from "@/lib/hooks/use-trip-data";
import { generateTripSummaryPDF } from "@/lib/pdf/trip-summary";
import { reportError } from "@/lib/utils/errors";
import { useSupabase } from "@/lib/context/supabase-provider";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { resetStore } from "@/lib/demo/demo-store";
import { MAP_TILES, getStoredMapStyle, setStoredMapStyle, type MapStyle } from "@/lib/config/map-tiles";
import { isTrackingEnabled, setTrackingEnabled } from "@/lib/native/platform";
import { areTaskRemindersEnabled, setTaskRemindersEnabled } from "@/lib/task-reminders";
import { getUserApiKey, setUserApiKey, detectProvider, hasLegacyPlainApiKey, hasEncryptedApiKey, migrateLegacyApiKey } from "@/lib/ai/user-key";
import { fetchProxyUsage } from "@/lib/ai/proxy";
import { useTampuPlus, invalidateTampuPlusCache } from "@/lib/billing/use-tampu-plus";
import { hasPasscode, isUnlocked, lock as lockApp, onLockChange } from "@/lib/crypto/passcode";
import { countLegacyPlainVaultBlobs, migrateLegacyVaultToEncrypted } from "@/lib/vault/storage";
import Link from "next/link";
import { RefreshCw, Database, HardDrive, Languages, Map as MapIcon, Navigation, Sparkles, Eye, EyeOff, Check, Download, Upload, Loader2, Bell, BarChart3, Trash2, FileText, Lock, Unlock, ShieldCheck, ShieldAlert, Zap, Key, Crown, Heart, MessageCircle } from "lucide-react";
import { useRef } from "react";
import { downloadBackup, importBackup } from "@/lib/backup";
import { getBriefConfig, setBriefConfig, type DailyBriefConfig } from "@/lib/daily-brief";
import { toast } from "@/components/ios/toast";
import {
  getTelemetryConsent,
  setTelemetryConsent,
  summarize,
  clearEvents,
  getEvents,
  type TelemetryConsent,
} from "@/lib/analytics";
import { Turnstile } from "@/components/security/turnstile";
import { verifyTurnstileToken } from "@/lib/security/verify-turnstile";

export default function SettingsPage() {
  const { t, locale, setLocale, formatCurrency } = useI18n();
  const { data: trip, loading } = useActiveTrip();
  const { mode, user } = useSupabase();
  const router = useRouter();
  const { data: reservations } = useReservations(trip?.id);
  const { data: tripDays } = useTripDays(trip?.id);
  const { data: documents } = useDocuments(trip?.id);
  const { data: budget } = useBudgetSummary();
  const [pdfBusy, setPdfBusy] = useState(false);

  // ─── Tampu+ Lifetime status ────────────────────────────────────────
  // Resuelve si el user ya compró el upgrade lifetime (USD 29). Cache 5min.
  const { isPlus, loading: plusLoading, purchase: plusPurchase, refresh: refreshPlus } = useTampuPlus();
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  const handleStartCheckout = async () => {
    // ─── Auth guard (iter 4) ──────────────────────────────────────────
    // Stripe checkout requiere user_id server-side; en demo/anónimo no podemos
    // attribuir la compra. Redirect al login con next= para volver acá tras
    // autenticarse (anchor #tampu-plus scroll-into-view).
    if (mode === "demo" || !user) {
      router.push("/login?next=" + encodeURIComponent("/settings#tampu-plus"));
      return;
    }
    setCheckoutBusy(true);
    try {
      const res = await fetch("/api/checkout/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: undefined, // se completa server-side desde la sesión si existe
          email: undefined,
          locale,
        }),
      });
      const json = (await res.json()) as { url?: string; error?: string; hint?: string };
      if (!res.ok || !json.url) {
        toast(
          json.error === "stripe_not_configured"
            ? "El checkout no está configurado todavía en este deploy."
            : `No pudimos iniciar el checkout: ${json.error ?? "error desconocido"}`,
          "error",
        );
        setCheckoutBusy(false);
        return;
      }
      window.location.href = json.url;
    } catch (err) {
      toast(`Error: ${(err as Error).message}`, "error");
      setCheckoutBusy(false);
    }
  };

  const handleRestorePurchase = async () => {
    invalidateTampuPlusCache();
    await refreshPlus();
    toast(isPlus ? "Compra restaurada · sos Tampu+" : "No encontramos una compra activa con tu cuenta", isPlus ? "success" : "info");
  };

  // Si el user vuelve de Stripe con ?upgrade=success, refrescá el estado
  // del lifetime después de un momento (el webhook tarda 1-2s en procesar).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const upgrade = params.get("upgrade");
    if (upgrade === "success") {
      toast("¡Gracias! Procesando tu compra…", "success");
      // Reintento simple: 2s, 5s.
      const t1 = setTimeout(() => { invalidateTampuPlusCache(); void refreshPlus(); }, 2000);
      const t2 = setTimeout(() => { invalidateTampuPlusCache(); void refreshPlus(); }, 5000);
      // Limpiar el query param para que no re-dispare al re-renderizar.
      const url = new URL(window.location.href);
      url.searchParams.delete("upgrade");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.toString());
      return () => { clearTimeout(t1); clearTimeout(t2); };
    } else if (upgrade === "cancelled") {
      toast("Compra cancelada. Tampu sigue funcionando gratis igual.", "info");
      const url = new URL(window.location.href);
      url.searchParams.delete("upgrade");
      window.history.replaceState({}, "", url.toString());
    }
  }, [refreshPlus]);

  const handleExportPDF = () => {
    if (!trip) return;
    setPdfBusy(true);
    try {
      const ok = generateTripSummaryPDF({
        trip,
        reservations: reservations ?? [],
        tripDays: tripDays ?? [],
        documents: documents ?? [],
        budget: budget ?? null,
        locale: locale === "en" ? "en-US" : "es-AR",
      });
      if (ok) {
        toast(t.pdfExport.success, "success");
      } else {
        toast(t.pdfExport.error, "error");
      }
    } catch (e) {
      toast((e as Error).message || t.pdfExport.error, "error");
    } finally {
      setPdfBusy(false);
    }
  };
  const [mapStyle, setMapStyle] = useState<MapStyle>(() => getStoredMapStyle());
  const [tracking, setTracking] = useState(false);
  const [taskReminders, setTaskReminders] = useState(false);
  const [apiKey, setApiKeyState] = useState<string>(() => getUserApiKey() || "");
  const [showKey, setShowKey] = useState(false);
  const [keyJustSaved, setKeyJustSaved] = useState(false);
  // Turnstile token para el BYOK paste (anti-bot abuse del flow de keys)
  const [byokTurnstileToken, setByokTurnstileToken] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [brief, setBrief] = useState<DailyBriefConfig>(() => getBriefConfig());
  const saveBrief = (next: DailyBriefConfig) => { setBrief(next); setBriefConfig(next); };

  // ─── AI mode selector (proxy / byok / pro) ──────────────────────────
  // El modo "efectivo" deriva de qué config hay:
  //   - hay key BYOK válida → "byok"
  //   - no hay key + proxy habilitado server-side → "proxy" (default)
  //   - no hay nada + proxy deshabilitado → "proxy" (con CTA de configurar)
  // "pro" es un tab visual ("Coming soon") hasta que Stripe esté integrado.
  type AiMode = "proxy" | "byok" | "pro";
  const initialMode: AiMode = (() => {
    const k = typeof window !== "undefined" ? getUserApiKey() : null;
    if (k && (k.startsWith("sk-ant-") || k.startsWith("AIza"))) return "byok";
    return "proxy";
  })();
  const [aiMode, setAiMode] = useState<AiMode>(initialMode);
  const [proxyUsage, setProxyUsage] = useState<{
    enabled: boolean;
    monthly: { used: number; cap: number };
    daily: { used: number; cap: number };
    tier: "anonymous" | "auth" | "byok" | "pro";
  } | null>(null);
  useEffect(() => {
    void fetchProxyUsage().then(u => setProxyUsage(u));
  }, [aiMode, keyJustSaved]); // refetch al cambiar de modo o guardar key

  // ─── WhatsApp linking (mayo 2026) ────────────────────────────────────────
  // Diferenciador estructural Tampu vs competidores: ninguno tiene WhatsApp
  // ingestion. El user vincula su número, luego reenvía confirmaciones de
  // viaje a un número Tampu y las parseamos con Claude Haiku.
  type WhatsAppLinkState =
    | { kind: "loading" }
    | { kind: "not-linked" }
    | { kind: "pending"; phone_e164: string; expires_at: string | null }
    | { kind: "linked"; phone_e164: string; verified_at: string };
  const [waState, setWaState] = useState<WhatsAppLinkState>({ kind: "loading" });
  const [waPhoneInput, setWaPhoneInput] = useState("");
  const [waBusy, setWaBusy] = useState(false);

  const refreshWa = async () => {
    try {
      const res = await fetch("/api/whatsapp/status");
      if (!res.ok) { setWaState({ kind: "not-linked" }); return; }
      const json = (await res.json()) as {
        linked: boolean; pending?: boolean;
        phone_e164?: string; verified_at?: string;
        verification_expires_at?: string | null;
      };
      if (json.linked && json.phone_e164 && json.verified_at) {
        setWaState({ kind: "linked", phone_e164: json.phone_e164, verified_at: json.verified_at });
      } else if (json.pending && json.phone_e164) {
        setWaState({ kind: "pending", phone_e164: json.phone_e164, expires_at: json.verification_expires_at ?? null });
      } else {
        setWaState({ kind: "not-linked" });
      }
    } catch {
      setWaState({ kind: "not-linked" });
    }
  };

  useEffect(() => { void refreshWa(); }, []);

  // Polling cada 3s mientras estamos en pending para detectar la verificación
  useEffect(() => {
    if (waState.kind !== "pending") return;
    const interval = setInterval(() => { void refreshWa(); }, 3000);
    return () => clearInterval(interval);
  }, [waState.kind]);

  const handleWaStartVerification = async () => {
    if (!waPhoneInput.trim()) {
      toast("Ingresá tu número de WhatsApp", "error");
      return;
    }
    setWaBusy(true);
    try {
      const res = await fetch("/api/whatsapp/start-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_raw: waPhoneInput.trim() }),
      });
      const json = await res.json() as { ok?: boolean; error?: string; hint?: string; phone_e164?: string; expires_in?: number };
      if (!res.ok || !json.ok) {
        const msg = json.hint
          ?? (json.error === "too_many_attempts" ? "Demasiados intentos. Esperá 1 hora." : `Error: ${json.error ?? "desconocido"}`);
        toast(msg, "error");
        setWaBusy(false);
        return;
      }
      toast("Te mandamos un código por WhatsApp. Respondé con el código para confirmar.", "success");
      setWaPhoneInput("");
      await refreshWa();
    } catch (err) {
      toast(`Error: ${(err as Error).message}`, "error");
    } finally {
      setWaBusy(false);
    }
  };

  const handleWaUnlink = async () => {
    if (!confirm("¿Desvincular tu WhatsApp? Los mensajes que ya recibimos se mantienen, pero mensajes nuevos no se asocian a tu cuenta.")) return;
    setWaBusy(true);
    try {
      const res = await fetch("/api/whatsapp/unlink", { method: "DELETE" });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        toast(`No pudimos desvincular (${res.status})${errText ? ": " + errText.slice(0, 80) : ""}`, "error");
        return;
      }
      toast("WhatsApp desvinculado", "info");
      await refreshWa();
    } catch (e) {
      // Network/parse errors antes quedaban mudos. Ahora damos feedback claro.
      reportError(e, "No pudimos desvincular");
    } finally {
      setWaBusy(false);
    }
  };

  // ─── Security at-rest (audit 05/2026) ───────────────────────────────────
  // Estado: ¿hay passcode? ¿está unlocked? ¿hay datos plain pendientes?
  // El UI cambia según combinación. Re-evaluamos al cambiar el lock state.
  const [secStatus, setSecStatus] = useState<{
    passcodeSet: boolean;
    unlocked: boolean;
    plainApiKey: boolean;
    encryptedApiKey: boolean;
    plainVaultBlobs: number;
  }>({ passcodeSet: false, unlocked: false, plainApiKey: false, encryptedApiKey: false, plainVaultBlobs: 0 });
  const [migrating, setMigrating] = useState(false);

  const refreshSec = async () => {
    const passcodeSet = await hasPasscode();
    setSecStatus({
      passcodeSet,
      unlocked: isUnlocked(),
      plainApiKey: hasLegacyPlainApiKey(),
      encryptedApiKey: hasEncryptedApiKey(),
      plainVaultBlobs: await countLegacyPlainVaultBlobs().catch(() => 0),
    });
  };

  useEffect(() => {
    void refreshSec();
    const off = onLockChange(() => void refreshSec());
    return off;
  }, []);

  const handleMigrate = async () => {
    if (!secStatus.unlocked) {
      toast("Desbloqueá la app primero (passcode)", "info");
      return;
    }
    setMigrating(true);
    try {
      const lines: string[] = [];
      if (secStatus.plainApiKey) {
        const r = await migrateLegacyApiKey();
        if (r.migrated) lines.push("API key cifrada");
        else if (r.reason) lines.push(`API key: ${r.reason}`);
      }
      if (secStatus.plainVaultBlobs > 0) {
        const r = await migrateLegacyVaultToEncrypted();
        lines.push(`Documentos: ${r.migrated} cifrados, ${r.skipped} ya estaban, ${r.failed} fallaron`);
      }
      toast(lines.join(" · ") || "Nada para migrar", "success");
      await refreshSec();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setMigrating(false);
    }
  };

  const handleLockNow = () => {
    lockApp();
    toast("App bloqueada", "info");
  };

  // ─── Telemetría (opt-in remoto + dashboard local) ────────────────────
  const [consent, setConsent] = useState<TelemetryConsent>("unknown");
  const [eventStats, setEventStats] = useState<{ name: string; count: number; lastTs: number }[]>([]);
  const [eventTotal, setEventTotal] = useState(0);
  useEffect(() => {
    setConsent(getTelemetryConsent());
    setEventStats(summarize());
    setEventTotal(getEvents().length);
    const refresh = () => {
      setConsent(getTelemetryConsent());
      setEventStats(summarize());
      setEventTotal(getEvents().length);
    };
    window.addEventListener("tampu-telemetry-consent-change", refresh);
    return () => window.removeEventListener("tampu-telemetry-consent-change", refresh);
  }, []);
  const handleConsentChange = (c: "opted-in" | "opted-out") => {
    setTelemetryConsent(c);
    setConsent(c);
    toast(c === "opted-in" ? "Telemetría activada" : "Telemetría desactivada", "info");
  };
  const handleClearEvents = () => {
    if (!confirm("¿Borrar el registro local de eventos?")) return;
    clearEvents();
    setEventStats([]);
    setEventTotal(0);
    toast("Eventos borrados", "info");
  };
  useEffect(() => {
    isTrackingEnabled().then(v => queueMicrotask(() => setTracking(v))).catch(() => {});
    areTaskRemindersEnabled().then(v => queueMicrotask(() => setTaskReminders(v))).catch(() => {});
  }, []);
  const handleSaveKey = async () => {
    // ─── Turnstile fallback (iter 4) ────────────────────────────────────
    // Si el env var NEXT_PUBLIC_TURNSTILE_SITE_KEY no está configurada (deploys
    // self-hosted / preview), el widget no carga y nunca llega el token. Antes
    // el botón quedaba siempre disabled. Ahora: si el widget no aplica (no env
    // o demo mode), permitimos save igual con un info-toast.
    const turnstileEnabled = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (turnstileEnabled && mode !== "demo") {
      if (!byokTurnstileToken) {
        toast("Verificación de seguridad opcional no disponible. Guardando igual.", "info");
        // continuar sin verifyTurnstile
      } else {
        const captcha = await verifyTurnstileToken(byokTurnstileToken);
        if (!captcha.ok) {
          toast("No pudimos verificar que sos humano. Reintentá el captcha.", "error");
          return;
        }
      }
    }
    setUserApiKey(apiKey);
    setKeyJustSaved(true);
    setTimeout(() => setKeyJustSaved(false), 2000);
  };
  const provider = detectProvider(apiKey);
  const keyValid = provider === "anthropic" || provider === "gemini";
  const handleReset = () => { if (confirm(t.settings.resetDemoData + "?")) { resetStore(); window.location.reload(); } };
  const handleMapStyleChange = (s: MapStyle) => { setStoredMapStyle(s); setMapStyle(s); };
  const handleTrackingChange = async (on: boolean) => { await setTrackingEnabled(on); setTracking(on); };
  const handleRemindersChange = async (on: boolean) => {
    await setTaskRemindersEnabled(on);
    setTaskReminders(on);
    if (on) {
      toast("Notificaciones activadas · te avisaremos un día antes y el día del vencimiento", "success");
      window.dispatchEvent(new Event("tampu-reminders-changed"));
    } else {
      toast("Notificaciones desactivadas", "info");
    }
  };
  if (loading) return null;
  return (
    <div className="space-y-6 pb-20 lg:pb-0 animate-fade-in">
      <SectionHeader title={t.settings.title} subtitle={t.settings.configuration} />

      {/* Language selector */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Languages className="w-4 h-4" />{t.settings.language}</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {LOCALES.map(l => (
              <button key={l} onClick={() => setLocale(l)}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${locale === l ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:text-foreground hover:bg-accent"}`}>
                {LOCALE_LABELS[l]}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ─── Security at-rest (audit 05/2026) ─── */}
      <Card className={
        secStatus.passcodeSet
          ? (secStatus.unlocked ? "border-l-4 border-l-success" : "border-l-4 border-l-warning")
          : "border-l-4 border-l-destructive"
      }>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {secStatus.passcodeSet
              ? (secStatus.unlocked ? <ShieldCheck className="w-4 h-4 text-success" /> : <Lock className="w-4 h-4 text-warning" />)
              : <ShieldAlert className="w-4 h-4 text-destructive" />}
            Seguridad · cifrado at-rest
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!secStatus.passcodeSet ? (
            <>
              <p className="text-xs text-muted-foreground">
                Tu API key y tus Documentos hoy se guardan <strong>en texto plano</strong> en este
                dispositivo. Si alguien accede al storage del navegador o de la app, los puede leer.
                Configurá un <strong>passcode</strong> para cifrarlos con AES-GCM(256) — solo lo conocés
                vos, no se sincroniza, no hay recovery.
              </p>
              <Link
                href={`/passcode?next=${encodeURIComponent("/settings")}`}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Lock className="w-4 h-4" />Configurar passcode
              </Link>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs">
                {secStatus.unlocked ? (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-success" />
                    <span><strong>Desbloqueado</strong> · auto-lock por inactividad (15 min)</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-warning" />
                    <span><strong>Bloqueado</strong> · ingresá el passcode para acceder a la API key y los Documentos</span>
                  </>
                )}
              </div>

              {(secStatus.plainApiKey || secStatus.plainVaultBlobs > 0) && (
                <div className="rounded-md bg-warning/10 border border-warning/30 p-3 text-xs space-y-2">
                  <p className="font-medium flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />Migración pendiente
                  </p>
                  <ul className="ml-4 list-disc space-y-0.5 text-muted-foreground">
                    {secStatus.plainApiKey && <li>API key todavía en texto plano</li>}
                    {secStatus.plainVaultBlobs > 0 && <li>{secStatus.plainVaultBlobs} documentos sin cifrar</li>}
                  </ul>
                  <Button
                    onClick={handleMigrate}
                    disabled={migrating || !secStatus.unlocked}
                    size="sm"
                    variant="outline"
                    className="gap-1 mt-1"
                  >
                    {migrating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    Cifrar ahora
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/passcode?next=${encodeURIComponent("/settings")}`}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium hover:bg-accent transition-colors"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />Gestionar passcode
                </Link>
                {secStatus.unlocked && (
                  <Button onClick={handleLockNow} variant="outline" size="sm" className="gap-1">
                    <Lock className="w-3.5 h-3.5" />Bloquear ahora
                  </Button>
                )}
              </div>

              <p className="text-[10px] text-muted-foreground leading-relaxed">
                PBKDF2-SHA256 · 600.000 iteraciones · AES-GCM(256). La master key vive solo en RAM.
                Lo que NO se cifra: IDs (UUIDs), mime type, tamaño y fecha de los archivos
                (metadata, no contenido). Esto permite listar tus Documentos sin pedir passcode.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Tampu+ Lifetime (USD 29 one-time) ─── */}
      {/* Compra única, sin renovación. Desbloquea proxy IA gestionado,    */}
      {/* badge Supporter, themes y crédito futuro de marketplace.         */}
      <Card id="tampu-plus" className={isPlus ? "border-l-4 border-l-success" : "border-l-4 border-l-primary"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className={`w-4 h-4 ${isPlus ? "text-success" : "text-primary"}`} />
            Tampu+
            {!isPlus && (
              <span className="text-[11px] font-normal text-muted-foreground ml-1">
                USD 29 · pagás una vez, no se renueva nunca
              </span>
            )}
            {isPlus && (
              <span className="text-[11px] font-medium text-success ml-1">
                Activo
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {plusLoading ? (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chequeando estado…
            </p>
          ) : isPlus ? (
            <>
              <div className="rounded-md bg-success/10 border border-success/30 p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Heart className="w-4 h-4 text-success" />
                  Sos Tampu+ {plusPurchase?.purchased_at
                    ? `desde ${new Date(plusPurchase.purchased_at).toLocaleDateString(locale === "en" ? "en-US" : "es-AR", { year: "numeric", month: "long", day: "numeric" })}`
                    : ""}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Gracias. En serio. Tenés desbloqueado el proxy IA gestionado (sin BYOK),
                  badge Supporter, themes adicionales y USD 5 de crédito para el futuro marketplace.
                  Si reservás por Booking via Tampu, igual recibo comisión — gracias doble.
                </p>
              </div>
              <Button
                onClick={handleRestorePurchase}
                variant="outline"
                size="sm"
                className="gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Restaurar compra
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Tampu es gratis para siempre. Si te sirve y querés apoyar al proyecto,
                {" "}<strong>Tampu+</strong> es una compra única de <strong>USD 29</strong> que
                desbloquea proxy IA gestionado (no hace falta tu propia key),
                badge, themes y crédito para el futuro marketplace. Cero suscripción.
                Cero renovación automática. Si no me apoyás, igual te sigue funcionando todo. ✋
              </p>
              <ul className="text-[11px] text-muted-foreground space-y-1 ml-4 list-disc">
                <li>Proxy IA gestionado: 200 llamadas/mes sin manejar API keys</li>
                <li>Badge <em>Supporter</em> en el perfil</li>
                <li>Themes adicionales (más allá del Hornocal default)</li>
                <li>Priority support · email con prefijo <code className="bg-muted px-1 py-0.5 rounded">[Tampu+]</code></li>
                <li>USD 5 de crédito para itinerarios premium en el marketplace (mes 2)</li>
              </ul>
              <Button
                onClick={handleStartCheckout}
                disabled={checkoutBusy}
                className="gap-1"
              >
                {checkoutBusy ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Abriendo checkout…</>
                ) : (
                  <><Heart className="w-4 h-4" />Apoyar a Tampu (USD 29)</>
                )}
              </Button>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Pago seguro vía Stripe · tarjeta de crédito o débito. Si ya compraste y no
                ves el badge, tocá <em>Restaurar compra</em> más abajo (necesita estar logueado
                con el mismo email).
              </p>
              <Button
                onClick={handleRestorePurchase}
                variant="outline"
                size="sm"
                className="gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Restaurar compra
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── WhatsApp (mayo 2026) ─── */}
      {/* Diferenciador competitivo: ningún competidor LatAm tiene WhatsApp   */}
      {/* ingestion. El user reenvía confirmaciones a un número Tampu y      */}
      {/* parseamos con Claude Haiku. MVP: solo texto, 1 phone por user.     */}
      <Card id="whatsapp" className={
        waState.kind === "linked" ? "border-l-4 border-l-success"
          : waState.kind === "pending" ? "border-l-4 border-l-warning"
          : "border-l-4 border-l-primary"
      }>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className={`w-4 h-4 ${
              waState.kind === "linked" ? "text-success"
                : waState.kind === "pending" ? "text-warning"
                : "text-primary"
            }`} />
            WhatsApp
            {waState.kind === "linked" && (
              <span className="text-[11px] font-medium text-success ml-1">Vinculado</span>
            )}
            {waState.kind === "pending" && (
              <span className="text-[11px] font-medium text-warning ml-1">Esperando código</span>
            )}
            {waState.kind === "not-linked" && (
              <span className="text-[11px] font-normal text-muted-foreground ml-1">Sin vincular</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Reenviá confirmaciones (vuelos, hoteles, reservas, mensajes del host de Airbnb,
            vouchers de tour) por WhatsApp a Tampu y las agrego automáticamente a tu viaje.
            Funciona también con mensajes en portugués brasileño.
          </p>

          {waState.kind === "loading" && (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chequeando estado…
            </p>
          )}

          {waState.kind === "not-linked" && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-muted-foreground">Tu número (con código de país)</label>
                <Input
                  type="tel"
                  value={waPhoneInput}
                  onChange={(e) => setWaPhoneInput(e.target.value)}
                  placeholder="+54 9 11 4040 4040"
                  autoComplete="tel"
                  className="font-mono"
                />
              </div>
              <Button onClick={handleWaStartVerification} disabled={waBusy || !waPhoneInput.trim()} className="gap-1">
                {waBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                Vincular WhatsApp
              </Button>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Te mandamos un código por WhatsApp. Respondé con el código en el mismo chat para
                confirmar.
              </p>
            </div>
          )}

          {waState.kind === "pending" && (
            <div className="rounded-md bg-warning/10 border border-warning/30 p-3 space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Loader2 className="w-4 h-4 animate-spin text-warning" />
                Esperando código de {waState.phone_e164}
              </p>
              <p className="text-xs text-muted-foreground">
                Te enviamos un mensaje por WhatsApp con un código de 6 dígitos. Respondé con el
                código en el mismo chat para terminar la vinculación. Vence en 10 minutos.
              </p>
              <Button
                onClick={handleWaUnlink}
                variant="outline"
                size="sm"
                disabled={waBusy}
                className="gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Cancelar
              </Button>
            </div>
          )}

          {waState.kind === "linked" && (
            <>
              <div className="rounded-md bg-success/10 border border-success/30 p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-success" />
                  Vinculado: <code className="font-mono">{waState.phone_e164}</code>
                </p>
                <p className="text-xs text-muted-foreground">
                  Desde ahora, reenviá cualquier confirmación de viaje al número Tampu y aparece
                  parseada en la sección WhatsApp de la app.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/whatsapp"
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border text-xs font-medium hover:bg-accent transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Ver mensajes
                </Link>
                <Button
                  onClick={handleWaUnlink}
                  variant="outline"
                  size="sm"
                  disabled={waBusy}
                  className="gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Desvincular
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── IA: 3 modos (proxy default / BYOK / Pro) ─── */}
      {/* Ver src/lib/ai/PROXY-DESIGN.md para la decisión arquitectónica. */}
      <Card id="ai" className="border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4" />Asistente IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ─── Tabs / Radios ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={() => setAiMode("proxy")}
              className={`p-3 rounded-lg text-left border-2 transition-all ${
                aiMode === "proxy" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <p className="text-sm font-medium">Modo proxy</p>
                <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/15 text-primary ml-auto">Default</span>
              </div>
              <p className="text-[10px] text-muted-foreground">50 llamadas/mes gratis cortesía de Tampu. Sin config.</p>
            </button>
            <button
              onClick={() => setAiMode("byok")}
              className={`p-3 rounded-lg text-left border-2 transition-all ${
                aiMode === "byok" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Key className="w-3.5 h-3.5" />
                <p className="text-sm font-medium">BYOK</p>
                <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground ml-auto">Power user</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Tu key Anthropic o Gemini. Sin límite, datos no pasan por Tampu.</p>
            </button>
            <button
              onClick={() => setAiMode("pro")}
              className={`p-3 rounded-lg text-left border-2 transition-all ${
                aiMode === "pro" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Crown className="w-3.5 h-3.5 text-warning" />
                <p className="text-sm font-medium">Tampu Pro</p>
                <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground ml-auto">Soon</span>
              </div>
              <p className="text-[10px] text-muted-foreground">USD 4.99/mes · IA ilimitada, sin manejar keys.</p>
            </button>
          </div>

          {/* ─── Panel del modo elegido ─── */}
          {aiMode === "proxy" && (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Default recomendado.</strong> Tampu te incluye <strong>50 llamadas IA por mes</strong> sin
                que tengas que configurar nada. Funciona para clasificar gastos, parsear bookings, sugerir
                tips de aeropuerto y consultas al Asistente.
              </p>

              {/* Usage meter */}
              {proxyUsage?.enabled && proxyUsage.monthly.cap > 0 && (
                <div className="rounded-md bg-muted/40 p-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Uso del mes</span>
                    <span className="font-mono tabular-nums">
                      <strong>{proxyUsage.monthly.used}</strong> / {proxyUsage.monthly.cap}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        proxyUsage.monthly.used / proxyUsage.monthly.cap > 0.8 ? "bg-warning" : "bg-primary"
                      }`}
                      style={{ width: `${Math.min(100, (proxyUsage.monthly.used / proxyUsage.monthly.cap) * 100)}%` }}
                    />
                  </div>
                  {proxyUsage.monthly.used >= proxyUsage.monthly.cap && (
                    <p className="text-[11px] text-warning">
                      Ya usaste tu cuota del mes. Sumá una key gratis de Gemini (tab BYOK) para seguir sin límite.
                    </p>
                  )}
                </div>
              )}
              {proxyUsage && !proxyUsage.enabled && (
                <p className="text-[11px] text-warning">
                  El proxy IA no está configurado en este deploy. Usá BYOK por ahora.
                </p>
              )}

              <p className="text-[10px] text-muted-foreground leading-relaxed">
                <strong>Privacy</strong>: en modo proxy mandamos solo el prompt mínimo de cada feature
                (ej. la descripción del gasto que clasificás). NUNCA mandamos tu vault entero, fotos, ni
                el trip completo. Si te preocupa, usá BYOK — los datos van directo a Anthropic/Gemini sin
                tocar nuestra infra.
              </p>
            </div>
          )}

          {aiMode === "byok" && (
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                Traé tu propia API key — Tampu no le ve el contenido a tus requests, y no tenés límite.
                La key se guarda <strong>solo en este dispositivo</strong> (cifrada si tenés passcode).
              </p>
              <p className="text-xs text-muted-foreground">
                <strong>Opción A — Google Gemini (GRATIS):</strong>{" "}
                <code className="bg-muted px-1 py-0.5 rounded">aistudio.google.com/apikey</code>{" "}
                → Create API key. Empieza con <code>AIza</code>. Free tier generoso.
              </p>
              <p className="text-xs text-muted-foreground">
                <strong>Opción B — Anthropic Claude (pago por uso):</strong>{" "}
                <code className="bg-muted px-1 py-0.5 rounded">console.anthropic.com</code>{" "}
                → Settings → API Keys. Empieza con <code>sk-ant-</code>. ~USD 0.003 por consulta.
              </p>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={e => setApiKeyState(e.target.value)}
                    placeholder="AIza... o sk-ant-..."
                    className="font-mono text-xs pr-10"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(s => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showKey ? "Ocultar key" : "Mostrar key"}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button
                  onClick={handleSaveKey}
                  disabled={
                    !apiKey ||
                    // Solo bloquear por token cuando Turnstile está realmente activo (env var + no demo)
                    (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && mode !== "demo" && !byokTurnstileToken) ||
                    (apiKey === getUserApiKey() && !keyJustSaved)
                  }
                  className="gap-1"
                >
                  {keyJustSaved ? <><Check className="w-4 h-4" />Guardado</> : "Guardar"}
                </Button>
              </div>
              <Turnstile onSuccess={(t) => setByokTurnstileToken(t)} className="mt-1" />

              {apiKey && !keyValid && (
                <p className="text-[11px] text-destructive">
                  Key no reconocida. Debe empezar con <code>sk-ant-</code> (Anthropic) o <code>AIza</code> (Google Gemini).
                </p>
              )}
              {apiKey && keyValid && (
                <p className="text-[11px] text-success">
                  ✓ Key configurada · provider: <strong>{provider === "anthropic" ? "Anthropic Claude" : "Google Gemini"}</strong>
                </p>
              )}

              {apiKey && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setApiKeyState(""); setUserApiKey(null); setAiMode("proxy"); }}
                  className="gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />Eliminar key (vuelve a modo proxy)
                </Button>
              )}
            </div>
          )}

          {aiMode === "pro" && (
            <div className="space-y-3 border-t border-border pt-3">
              <div className="rounded-md bg-warning/10 border border-warning/30 p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-warning" />
                  Tampu Pro · próximamente
                </p>
                <p className="text-xs text-muted-foreground">
                  IA ilimitada (clasificar, parsear, asistente, itinerarios) sin que vos manejes keys
                  ni te quedes sin cuota. Billing centralizado, una factura.
                </p>
                <p className="text-xs">
                  <strong>USD 4.99/mes</strong> · cancelás cuando quieras.
                </p>
                <Button
                  disabled
                  size="sm"
                  variant="outline"
                  className="gap-1 cursor-not-allowed opacity-70"
                  title="Stripe pending — sprint siguiente"
                >
                  <Crown className="w-3.5 h-3.5" />Coming soon
                </Button>
                {/* TODO Stripe: reemplazar el botón disabled por <Link href="/checkout/pro"> */}
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Mientras tanto: el modo proxy te alcanza para uso casual (50 calls/mes), y BYOK con Gemini
                gratis te alcanza para uso intenso. Pro es para quien no quiere ni pensar en esto.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Daily brief notification ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="w-4 h-4" />Daily brief</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Notificación nativa cada mañana con lo que tenés en el día. Funciona en iPhone/Android
            (PWA + permiso). En desktop no hay notificación pero podés abrir la app.
          </p>
          <label className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30 cursor-pointer">
            <span className="text-sm font-medium">
              {brief.enabled ? "Activado" : "Desactivado"}
            </span>
            <input
              type="checkbox"
              checked={brief.enabled}
              onChange={(e) => saveBrief({ ...brief, enabled: e.target.checked })}
              className="w-5 h-5"
            />
          </label>
          {brief.enabled && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Hora</label>
                <Input
                  type="number" min={0} max={23} value={brief.hour}
                  onChange={e => saveBrief({ ...brief, hour: Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0)) })}
                  className="mt-1 font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Minuto</label>
                <Input
                  type="number" min={0} max={59} value={brief.minute}
                  onChange={e => saveBrief({ ...brief, minute: Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)) })}
                  className="mt-1 font-mono"
                />
              </div>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            La notificación se reprograma cada vez que abrís la app. Si te quedás 24h sin abrirla, no llega.
          </p>
        </CardContent>
      </Card>

      {/* ─── Recordatorios de pendientes (to-do style) ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell className="w-4 h-4" />Recordatorios de pendientes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Notificaciones nativas para tasks y reservas con deadline. Te avisamos
            <strong> un día antes a las 9am</strong> y <strong>el mismo día a las 9am</strong>.
            Se reprograma automáticamente cada vez que agregás o completás un pendiente.
          </p>
          <label className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30 cursor-pointer">
            <span className="text-sm font-medium">
              {taskReminders ? "Activadas" : "Desactivadas"}
            </span>
            <input
              type="checkbox"
              checked={taskReminders}
              onChange={(e) => handleRemindersChange(e.target.checked)}
              className="w-5 h-5"
            />
          </label>
          <p className="text-[10px] text-muted-foreground">
            Requiere instalar Tampu como app nativa (iOS/Android vía Capacitor). En navegador
            web no funciona — usá el Daily brief de arriba para resumen diario.
          </p>
        </CardContent>
      </Card>

      {/* ─── PDF Export — trip summary printable ─── */}
      {trip && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="w-4 h-4" />{t.pdfExport.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">{t.pdfExport.description}</p>
            <Button
              onClick={handleExportPDF}
              disabled={pdfBusy}
              variant="outline"
              className="gap-1"
            >
              {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {pdfBusy ? t.pdfExport.generating : t.pdfExport.button}
            </Button>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Tu sistema te va a pedir guardar como PDF. Incluye portada, itinerario,
              reservas confirmadas, presupuesto y contactos de emergencia.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ─── Backup / Restore — JSON portable ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><HardDrive className="w-4 h-4" />Backup y restore</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Tus datos viven en este dispositivo (localStorage + IndexedDB). Sin cuenta = sin cloud sync.
            <strong> Exportá un JSON</strong> antes de cambiar de teléfono o limpiar datos del navegador.
            Importás el mismo archivo en el otro device y volvés a tener todo.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={async () => {
                setBackupBusy(true);
                try {
                  const r = await downloadBackup();
                  toast(`Backup descargado · ${r.count_keys} claves · ${r.count_blobs} archivos · ${Math.round(r.bytes / 1024)} KB`, "success");
                } catch (e) {
                  toast("Error al exportar: " + (e as Error).message, "error");
                }
                setBackupBusy(false);
              }}
              disabled={backupBusy}
              variant="outline"
              className="gap-1"
            >
              {backupBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Exportar backup (.json)
            </Button>
            <Button
              onClick={() => restoreInputRef.current?.click()}
              disabled={backupBusy}
              variant="outline"
              className="gap-1"
            >
              <Upload className="w-4 h-4" />
              Importar backup
            </Button>
            <input
              ref={restoreInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (!confirm(`Importar "${f.name}"? Sobrescribe los datos actuales del dispositivo.`)) {
                  e.target.value = "";
                  return;
                }
                setBackupBusy(true);
                const r = await importBackup(f);
                setBackupBusy(false);
                e.target.value = "";
                if (r.ok) {
                  toast(`Restaurado · ${r.count_keys} claves · ${r.count_blobs} archivos. Recargá para ver los cambios.`, "success");
                  setTimeout(() => window.location.reload(), 1500);
                } else {
                  toast("Error: " + (r.error || "no fue posible importar"), "error");
                }
              }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            El backup incluye: viajes, reservas, gastos, documentos (PDFs en base64), API key,
            preferencias, vistas fijadas, cache de tips. NO incluye datos de Supabase si usás
            modo online (esos viven server-side).
          </p>
        </CardContent>
      </Card>

      {/* Map style + labels */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MapIcon className="w-4 h-4" />Estilo del mapa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Las etiquetas de OSM por defecto están en el idioma local del lugar (chino, ruso, etc).
            Elegí un estilo con etiquetas neutrales (Latin/inglés transliterado).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.values(MAP_TILES).map(opt => (
              <button
                key={opt.id}
                onClick={() => handleMapStyleChange(opt.id)}
                className={`p-3 rounded-lg text-left border-2 transition-all ${mapStyle === opt.id ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"}`}
              >
                <p className="text-sm font-medium">{opt.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 break-all">{new URL(opt.url.replace("{s}", "a")).hostname}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Geolocation opt-in */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Navigation className="w-4 h-4" />Tracking GPS (opcional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Si lo activás, el asistente sabe tu aeropuerto más cercano y prioriza el pase de embarque correcto.
            Los puntos se guardan SOLO en este dispositivo. Cero envío a servidor.
          </p>
          <label className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 cursor-pointer">
            <input type="checkbox" checked={tracking} onChange={e => handleTrackingChange(e.target.checked)} className="w-4 h-4" />
            <span className="text-sm font-medium">
              {tracking ? "Tracking activado" : "Tracking desactivado"}
            </span>
          </label>
        </CardContent>
      </Card>

      {/* ─── Telemetría (opt-in remoto + dashboard local) ─── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Telemetría
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Tampu siempre registra eventos <strong>en tu propio dispositivo</strong> (los ves abajo).
            Lo único que cambiás acá es si querés que se envíe <strong>también a Plausible</strong> —
            un analytics privacy-friendly, sin cookies, sin tracking cross-site, sin PII. <strong>Default: apagado.</strong>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleConsentChange("opted-in")}
              className={`p-3 rounded-lg text-left border-2 transition-all ${
                consent === "opted-in" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <p className="text-sm font-medium">Activar envío</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Sumás señales agregadas para mejorar Tampu</p>
            </button>
            <button
              onClick={() => handleConsentChange("opted-out")}
              className={`p-3 rounded-lg text-left border-2 transition-all ${
                consent === "opted-out" ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <p className="text-sm font-medium">No enviar</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Default · todo queda local</p>
            </button>
          </div>

          <div className="border-t border-border pt-3 mt-2">
            <p className="text-xs font-medium mb-2">Actividad local · {eventTotal} eventos</p>
            {eventStats.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Sin eventos registrados todavía.</p>
            ) : (
              <ul className="space-y-1 max-h-64 overflow-y-auto pr-1">
                {eventStats.slice(0, 30).map((e) => (
                  <li key={e.name} className="flex items-center justify-between gap-2 text-[11px]">
                    <code className="font-mono text-muted-foreground truncate">{e.name}</code>
                    <span className="tabular-nums text-muted-foreground shrink-0">{e.count}</span>
                  </li>
                ))}
              </ul>
            )}
            {eventStats.length > 0 && (
              <Button onClick={handleClearEvents} variant="outline" size="sm" className="mt-3 gap-1">
                <Trash2 className="w-3 h-3" />
                Borrar registro local
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Data mode */}
      <Card>
        <CardHeader><CardTitle>{t.settings.dataMode}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
            {mode === "online" ? <Database className="w-5 h-5 text-success" /> : <HardDrive className="w-5 h-5 text-warning" />}
            <div>
              <p className="text-sm font-semibold">{mode === "online" ? t.settings.onlineMode : mode === "demo" ? t.settings.demoMode : t.settings.unconfigured}</p>
              <p className="text-xs text-muted-foreground">{mode === "online" ? t.settings.onlineDesc : mode === "demo" ? t.settings.demoDesc : t.settings.unconfiguredDesc}</p>
            </div>
          </div>
          {mode === "demo" && <Button variant="outline" onClick={handleReset} className="gap-2"><RefreshCw className="w-4 h-4" />{t.settings.resetDemoData}</Button>}
          {mode !== "online" && <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground"><p className="font-medium mb-1">{t.settings.connectSupabase}</p><p>1. supabase.com → New Project</p><p>2. SQL Editor → schema.sql</p><p>3. .env.local → URL + Key</p></div>}
        </CardContent>
      </Card>

      {trip && (
        <Card>
          <CardHeader><CardTitle>{t.settings.activeTrip}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">{t.settings.name}:</span><p className="font-medium">{trip.name}</p></div>
              <div><span className="text-muted-foreground">{t.settings.destination}:</span><p className="font-medium">{trip.destination}</p></div>
              <div><span className="text-muted-foreground">{t.settings.dates}:</span><p className="font-medium">{trip.start_date} → {trip.end_date}</p></div>
              <div><span className="text-muted-foreground">{t.expenses.currency}:</span><p className="font-medium">{trip.base_currency}</p></div>
              <div><span className="text-muted-foreground">{t.budget.title}:</span><p className="font-medium">{formatCurrency(trip.total_budget)}</p></div>
              <div><span className="text-muted-foreground">{t.dashboard.contingency}:</span><p className="font-medium">{trip.contingency_percent}% ({formatCurrency(trip.contingency_amount)})</p></div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
