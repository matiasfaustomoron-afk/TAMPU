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
import { useSupabase } from "@/lib/context/supabase-provider";
import { useI18n } from "@/i18n/provider";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { resetStore } from "@/lib/demo/demo-store";
import { MAP_TILES, getStoredMapStyle, setStoredMapStyle, type MapStyle } from "@/lib/config/map-tiles";
import { isTrackingEnabled, setTrackingEnabled } from "@/lib/native/platform";
import { areTaskRemindersEnabled, setTaskRemindersEnabled } from "@/lib/task-reminders";
import { getUserApiKey, setUserApiKey, detectProvider } from "@/lib/ai/user-key";
import { RefreshCw, Database, HardDrive, Languages, Map as MapIcon, Navigation, Sparkles, Eye, EyeOff, Check, Download, Upload, Loader2, Bell, BarChart3, Trash2, FileText } from "lucide-react";
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

export default function SettingsPage() {
  const { t, locale, setLocale, formatCurrency } = useI18n();
  const { data: trip, loading } = useActiveTrip();
  const { mode } = useSupabase();
  const { data: reservations } = useReservations(trip?.id);
  const { data: tripDays } = useTripDays(trip?.id);
  const { data: documents } = useDocuments(trip?.id);
  const { data: budget } = useBudgetSummary();
  const [pdfBusy, setPdfBusy] = useState(false);

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
  const [backupBusy, setBackupBusy] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [brief, setBrief] = useState<DailyBriefConfig>(() => getBriefConfig());
  const saveBrief = (next: DailyBriefConfig) => { setBrief(next); setBriefConfig(next); };

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
  const handleSaveKey = () => {
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

      {/* AI key — supports Anthropic Claude OR Google Gemini (auto-detected) */}
      <Card className={apiKey && keyValid ? "border-l-4 border-l-success" : "border-l-4 border-l-primary"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4" />API key de IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Necesaria para Asistente, clasificación de boarding passes, info de aeropuertos y parser de bookings.
            La key se guarda <strong>solo en este dispositivo</strong> (localStorage). Tampu nunca la persiste en servidor.
          </p>
          <p className="text-xs text-muted-foreground">
            <strong>Opción A — Google Gemini (GRATIS):</strong> ir a <code className="bg-muted px-1 py-0.5 rounded">aistudio.google.com/apikey</code>{" "}
            → Create API key. Empieza con <code>AIza</code>. <strong>Free tier generoso, sin costo.</strong>
          </p>
          <p className="text-xs text-muted-foreground">
            <strong>Opción B — Anthropic Claude (pago por uso):</strong> ir a <code className="bg-muted px-1 py-0.5 rounded">console.anthropic.com</code>{" "}
            → Settings → API Keys. Empieza con <code>sk-ant-</code>. Costo ~USD 0.003 por consulta.
          </p>
          <p className="text-xs text-muted-foreground">
            Pegá cualquiera de las dos — auto-detectamos el provider.
          </p>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={e => setApiKeyState(e.target.value)}
                placeholder="sk-ant-..."
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
            <Button onClick={handleSaveKey} disabled={!apiKey || (apiKey === getUserApiKey() && !keyJustSaved)} className="gap-1">
              {keyJustSaved ? <><Check className="w-4 h-4" />Guardado</> : "Guardar"}
            </Button>
          </div>

          {apiKey && !keyValid && (
            <p className="text-[11px] text-destructive">
              Key no reconocida. Debe empezar con <code>sk-ant-</code> (Anthropic) o <code>AIza</code> (Google Gemini).
            </p>
          )}
          {apiKey && keyValid && (
            <p className="text-[11px] text-success">
              ✓ Key configurada. Provider: <strong>{provider === "anthropic" ? "Anthropic Claude" : "Google Gemini"}</strong>
            </p>
          )}
          {!apiKey && (
            <p className="text-[11px] text-primary">
              Sin key, el Asistente responde con datos locales nada más. Gemini es <strong>gratis</strong>.
            </p>
          )}

          <Button variant="outline" size="sm" onClick={() => { setApiKeyState(""); setUserApiKey(null); }} className="mt-2">
            Eliminar key
          </Button>
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
            El backup incluye: trips, reservas, gastos, vault (PDFs en base64), API key,
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
            Si lo activás, el asistente sabe tu aeropuerto más cercano y prioriza el boarding pass correcto.
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
