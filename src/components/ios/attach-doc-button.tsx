"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Paperclip, FileText, Eye, Trash2, Loader2, Camera } from "lucide-react";
import { saveVaultBlob, deleteVaultBlob, openVaultBlob } from "@/lib/vault/storage";
import { capturePhoto, haptic, isNative } from "@/lib/native/platform";
import { toast } from "@/components/ios/toast";
import { useActiveTrip } from "@/lib/hooks/use-trip-data";
import { useSupabase } from "@/lib/context/supabase-provider";
import type { Attachment } from "@/lib/types/database";
import { cn } from "@/lib/utils/helpers";
import { useI18n } from "@/i18n/provider";

interface AttachDocButtonProps {
  entityType: Attachment["entity_type"];
  entityId: string;
  category: Attachment["category"];
  hint?: string;            // microcopy shown when no docs
  compact?: boolean;        // tiny version — just icon
  className?: string;
}

// ─── Read attachments tied to a specific entity (demo + online) ───
function loadAttachments(tripId: string, entityType: string, entityId: string, mode: string): Attachment[] {
  if (typeof window === "undefined") return [];
  if (mode === "demo") {
    try {
      const raw = localStorage.getItem(`travel-os-vault-${tripId}`);
      const all: Attachment[] = raw ? JSON.parse(raw) : [];
      return all.filter(a => a.entity_type === entityType && a.entity_id === entityId);
    } catch { return []; }
  }
  return []; // online mode loads via Supabase elsewhere
}

function saveAttachmentsToStore(tripId: string, all: Attachment[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`travel-os-vault-${tripId}`, JSON.stringify(all));
  // Notify other parts of the app (e.g. /vault) to refresh
  window.dispatchEvent(new CustomEvent("travel-os-vault-change"));
}

export function AttachDocButton({
  entityType, entityId, category, hint, compact, className,
}: AttachDocButtonProps) {
  const { t } = useI18n();
  const { data: trip } = useActiveTrip();
  const { mode } = useSupabase();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [nativeAvail, setNativeAvail] = useState(false);

  useEffect(() => { isNative().then(setNativeAvail); }, []);

  const refresh = useCallback(() => {
    if (!trip) return;
    queueMicrotask(() => setAttachments(loadAttachments(trip.id, entityType, entityId, mode)));
  }, [trip, entityType, entityId, mode]);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("travel-os-vault-change", onChange);
    return () => window.removeEventListener("travel-os-vault-change", onChange);
  }, [refresh]);

  const handleFile = useCallback(async (f: File | null) => {
    if (!f || !trip) return;
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      await saveVaultBlob(id, f);
      const isCritical = category === "boarding_pass" || category === "identity" || category === "insurance";
      const newAtt: Attachment = {
        id, trip_id: trip.id, user_id: "demo",
        entity_type: entityType, entity_id: entityId, category,
        file_name: f.name,
        file_type: f.type, file_size: f.size,
        storage_path: `idb:${id}`,
        is_favorite: false, is_critical: isCritical,
        available_offline: true, notes: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      const raw = localStorage.getItem(`travel-os-vault-${trip.id}`);
      const all: Attachment[] = raw ? JSON.parse(raw) : [];
      saveAttachmentsToStore(trip.id, [newAtt, ...all]);
      haptic("medium");
      toast(`${f.name} ${t.vault.attach.savedToVault}`, "success");
      refresh();
    } catch (e) {
      toast(`No se pudo guardar: ${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [trip, entityType, entityId, category, refresh, t]);

  const handleDelete = useCallback(async (att: Attachment) => {
    if (!trip) return;
    if (!confirm(`¿Eliminar "${att.file_name}"?`)) return;
    if (att.storage_path.startsWith("idb:")) await deleteVaultBlob(att.id).catch(() => {});
    const raw = localStorage.getItem(`travel-os-vault-${trip.id}`);
    const all: Attachment[] = raw ? JSON.parse(raw) : [];
    saveAttachmentsToStore(trip.id, all.filter(a => a.id !== att.id));
    haptic("light");
    toast(t.vault.attach.deleted, "info");
    refresh();
  }, [trip, refresh, t]);

  const handleOpen = useCallback(async (att: Attachment) => {
    if (att.storage_path.startsWith("idb:")) {
      await openVaultBlob(att.id, att.file_name);
    }
  }, []);

  const handleCamera = useCallback(async () => {
    haptic("light");
    const photo = await capturePhoto({ source: "camera" });
    if (photo?.dataUrl) {
      const r = await fetch(photo.dataUrl);
      const blob = await r.blob();
      const f = new File([blob], `scan-${Date.now()}.${photo.format || "jpg"}`, { type: blob.type });
      handleFile(f);
    }
  }, [handleFile]);

  if (compact) {
    return (
      <div className={cn("inline-flex items-center gap-1.5", className)}>
        {attachments.length > 0 && (
          <button
            onClick={() => handleOpen(attachments[0])}
            className="pressable inline-flex items-center gap-1 px-2 py-1 rounded-full tampu-icon tampu-icon-cardon text-[11px] font-medium"
            title={`Ver ${attachments[0].file_name}`}
          >
            <FileText className="w-3 h-3" /> {attachments.length}
          </button>
        )}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="pressable inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground hover:text-primary disabled:opacity-50"
          aria-label="Adjuntar documento"
          title="Adjuntar documento"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*"
          className="hidden"
          onChange={e => handleFile(e.target.files?.[0] || null)}
        />
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Existing attachments */}
      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map(att => (
            <div key={att.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-muted/60">
              <span className="w-7 h-7 rounded-lg tampu-icon tampu-icon-cardon flex items-center justify-center shrink-0">
                <FileText className="w-3.5 h-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium truncate">{att.file_name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {(att.file_size / 1024).toFixed(0)} KB · offline
                </p>
              </div>
              <button onClick={() => handleOpen(att)} className="pressable p-1.5 text-muted-foreground hover:text-foreground" aria-label="Abrir">
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => handleDelete(att)} className="pressable p-1.5 text-muted-foreground hover:text-destructive" aria-label="Eliminar">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload affordance */}
      <div className="flex gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="pressable flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors text-[13px] font-medium disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          {attachments.length > 0 ? t.vault.attach.attachAnother : (hint || t.vault.attach.attachPdfImage)}
        </button>
        {nativeAvail && (
          <button
            onClick={handleCamera}
            disabled={busy}
            className="pressable flex items-center justify-center w-10 h-10 rounded-xl border border-dashed border-border bg-muted/30 text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-50"
            aria-label="Escanear con cámara"
            title="Escanear con cámara"
          >
            <Camera className="w-4 h-4" />
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*"
        className="hidden"
        onChange={e => handleFile(e.target.files?.[0] || null)}
      />

      <p className="text-[10px] text-muted-foreground">
        {t.vault.attach.offlineFooter} {entityType === "reservation" ? t.vault.attach.itemReservation : t.vault.attach.itemRecord}.
      </p>
    </div>
  );
}
