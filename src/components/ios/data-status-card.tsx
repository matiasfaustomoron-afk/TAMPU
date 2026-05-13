"use client";

import { useEffect, useState, useCallback } from "react";
import { Download, Upload, AlertTriangle, CheckCircle2, HardDrive } from "lucide-react";
import { useSupabase } from "@/lib/context/supabase-provider";
import { downloadBackup, importBackup } from "@/lib/backup";
import { toast } from "@/components/ios/toast";
import { inspectStorage } from "@/lib/storage/version";

/**
 * Data status card — visible en /more y opcionalmente en /vault.
 *
 * Responde a la pregunta de trust: "si pierdo el celular, ¿pierdo todo?"
 *
 * Estados visuales (orden de severidad):
 *   1. Online + cloud sync: "Tus datos viven en la nube"
 *   2. Demo + backup reciente (<7 días): "Tu último backup es del X"
 *   3. Demo + backup viejo (>7 días): "Hace 12 días sin backup — descargar"
 *   4. Demo + sin backup: "Sin backup. Tus datos viven SOLO acá"
 *
 * Acciones siempre disponibles:
 *   - Descargar backup (JSON)
 *   - Restaurar desde backup (file input)
 */

const LAST_BACKUP_KEY = "tampu-last-backup-at";

function getLastBackupISO(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
}

function setLastBackupISO(iso: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LAST_BACKUP_KEY, iso);
  } catch {
    /* ignore */
  }
}

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const d = Date.parse(iso);
  if (!isFinite(d)) return null;
  return Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24));
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function DataStatusCard() {
  const { mode } = useSupabase();
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [totalSize, setTotalSize] = useState(0);
  const [keyCount, setKeyCount] = useState(0);
  const [busy, setBusy] = useState(false);

  // Hydrate after mount (avoid SSR mismatch)
  useEffect(() => {
    setLastBackup(getLastBackupISO());
    const stats = inspectStorage();
    setTotalSize(stats.reduce((s, k) => s + k.size, 0));
    setKeyCount(stats.length);
  }, []);

  const handleExport = useCallback(async () => {
    setBusy(true);
    try {
      const result = await downloadBackup();
      const now = new Date().toISOString();
      setLastBackupISO(now);
      setLastBackup(now);
      toast(
        `Backup descargado · ${result.count_keys} claves, ${result.count_blobs} archivos`,
        "success"
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al exportar", "error");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleImport = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const result = await importBackup(file);
      if (result.ok) {
        toast(`Restaurado · ${result.count_keys} claves, ${result.count_blobs} archivos`, "success");
        // Re-inspect storage after import
        const stats = inspectStorage();
        setTotalSize(stats.reduce((s, k) => s + k.size, 0));
        setKeyCount(stats.length);
      } else {
        toast(result.error || "No se pudo importar el backup", "error");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error al importar", "error");
    } finally {
      setBusy(false);
    }
  }, []);

  const days = daysAgo(lastBackup);
  const isOnline = mode === "online";

  // Determine state
  let icon: React.ReactNode;
  let title: string;
  let subtitle: string;
  let tone: "ok" | "warn" | "alert" | "neutral";

  if (isOnline) {
    icon = <CheckCircle2 className="w-5 h-5" />;
    title = "Tus datos están en la nube";
    subtitle = "Sincronizan en cuanto guardás. Recuperás todo al loguearte en otro dispositivo.";
    tone = "ok";
  } else if (days === null) {
    icon = <AlertTriangle className="w-5 h-5" />;
    title = "Sin backup";
    subtitle = `Tus datos viven SOLO en este dispositivo. ${keyCount} entradas · ${humanSize(totalSize)}. Descargá un backup ahora para no perderlos.`;
    tone = "alert";
  } else if (days < 7) {
    icon = <CheckCircle2 className="w-5 h-5" />;
    title = `Último backup hace ${days === 0 ? "menos de un día" : days === 1 ? "1 día" : `${days} días`}`;
    subtitle = `${keyCount} entradas · ${humanSize(totalSize)}. Bajá uno nuevo si cargaste cosas importantes.`;
    tone = "ok";
  } else {
    icon = <AlertTriangle className="w-5 h-5" />;
    title = `Hace ${days} días sin backup`;
    subtitle = `${keyCount} entradas · ${humanSize(totalSize)} viven solo acá. Si perdés el dispositivo, perdés todo.`;
    tone = "warn";
  }

  const toneClass =
    tone === "ok"    ? "tampu-icon tampu-icon-cardon" :
    tone === "warn"  ? "tampu-icon tampu-icon-mostaza" :
    tone === "alert" ? "tampu-icon tampu-icon-carmin" :
                       "tampu-icon tampu-icon-piedra";

  return (
    <div className="ios-card p-4">
      <div className="flex items-start gap-3.5">
        <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${toneClass}`}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted-foreground mb-0.5">
            Tus datos
          </p>
          <p className="text-[15px] font-semibold leading-tight">{title}</p>
          <p className="text-[12.5px] text-muted-foreground mt-1 leading-snug">{subtitle}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={handleExport}
          disabled={busy}
          className="pressable inline-flex items-center justify-center gap-2 h-10 rounded-xl text-[13px] font-semibold bg-primary text-primary-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Descargar backup de todos los datos"
        >
          <Download className="w-4 h-4" aria-hidden />
          Descargar backup
        </button>

        <label
          className="pressable inline-flex items-center justify-center gap-2 h-10 rounded-xl text-[13px] font-semibold border-2 border-border hover:bg-accent cursor-pointer focus-within:outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2"
          aria-label="Restaurar desde un archivo de backup"
        >
          <Upload className="w-4 h-4" aria-hidden />
          Restaurar
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {!isOnline && (
        <div className="mt-3 pt-3 border-t border-border/40 flex items-start gap-2">
          <HardDrive className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
          <p className="text-[11px] text-muted-foreground leading-snug">
            iCloud Drive backup automático llega en una próxima versión (vía Capacitor
            Filesystem). Por ahora, descargá el JSON cada cierto tiempo.
          </p>
        </div>
      )}
    </div>
  );
}
