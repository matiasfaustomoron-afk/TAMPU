"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { EmptyState } from "@/components/shared";
import { LargeTitle, WalletCard, Sheet } from "@/components/ios";
import { useActiveTrip, useReservations, useAttachments, useMutations } from "@/lib/hooks/use-trip-data";
import { useSupabase } from "@/lib/context/supabase-provider";
import { findBestReservationMatch, linkAttachmentToReservation } from "@/lib/domain/attachment-linker";
import { useI18n } from "@/i18n/provider";
import {
  FileText, Upload, Star, StarOff, Shield, Trash2, Eye, Plus, X, Search,
  Camera, Download, Image as ImageIcon, File as FileIcon, Sparkles, Loader2,
} from "lucide-react";
import { capturePhoto, haptic, isNative } from "@/lib/native/platform";
import { toast } from "@/components/ios/toast";
import { useConfirmSheet } from "@/lib/hooks/use-confirm-sheet";
import { withApiKeyHeaders } from "@/lib/ai/user-key";
import { saveVaultBlob, deleteVaultBlob, openVaultBlob, downloadVaultBlob, getVaultDataUrl, estimateVaultUsage } from "@/lib/vault/storage";
import { readVersioned, writeVersioned } from "@/lib/storage/version";
import { track, EVENTS } from "@/lib/analytics";
import { HintCard } from "@/components/ios/hint-card";
import type { Attachment } from "@/lib/types/database";

// Schema version del array de Attachment[] guardado en localStorage por trip.
// Si en el futuro cambiamos el shape de Attachment, subir esta versión y agregar
// rama de migración en `migrateVault` abajo. Histórico:
//   v0 → array directo, sin wrapper (legacy pre-mayo 2026)
//   v1 → wrapper { v, data: Attachment[] } sin cambios de shape (adopción inicial)
const VAULT_SCHEMA = 1;

function migrateVault(data: unknown, fromVersion: number): Attachment[] | null {
  // v0 (legacy sin wrapper): aceptar si es array
  if (fromVersion === 0 && Array.isArray(data)) {
    return data as Attachment[];
  }
  // Futuras migraciones (v1 → v2, etc.) viven acá.
  return null;
}

const CATEGORIES = ["insurance", "boarding_pass", "identity", "reservation", "transport", "health", "receipt", "other"] as const;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function VaultPage() {
  const { t, formatDate } = useI18n();
  const { client, mode } = useSupabase();
  const { data: trip } = useActiveTrip();
  const { data: reservations } = useReservations(trip?.id);
  // Lectura via TanStack: fuente unica para vault page + boarding-passes widget.
  // Reemplaza el `useEffect` que hacía fetch a mano + setFiles. El array local
  // `files` se mantiene como derivado (mismo shape) hasta que un iter futuro
  // migre completamente los mutadores (upload/delete/favorite) a useMutations.
  // TODO Iter 3: pasar `toggleFavorite`/upload-flow a `addAttachment`/`updateAttachment`
  // mutations para que invaliden cache automáticamente.
  const { data: attachmentsRaw, loading: attachmentsLoading, refetch: refetchAttachments } = useAttachments(trip?.id);
  const { addAttachment, updateAttachment: updateAttachmentMut, deleteAttachment: deleteAttachmentMut } = useMutations();
  // Reemplazo iOS-style del window.confirm() — drag-to-dismiss + escape + a11y.
  const { confirm, sheet: confirmSheet } = useConfirmSheet();
  const [files, setFiles] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [usage, setUsage] = useState<{ count: number; bytes: number }>({ count: 0, bytes: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [focusedFileId, setFocusedFileId] = useState<string | null>(null);
  const [focusedCategory, setFocusedCategory] = useState<string | null>(null);

  // Read query string client-side only (SSG-friendly)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    queueMicrotask(() => {
      setFocusedFileId(params.get("file"));
      setFocusedCategory(params.get("category"));
    });
  }, []);

  // Upload form
  const [uploadCategory, setUploadCategory] = useState<string>("boarding_pass");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [classifyAuto, setClassifyAuto] = useState(true);
  const [classifying, setClassifying] = useState(false);
  const [lastClassification, setLastClassification] = useState<string | null>(null);
  const [extractedFields, setExtractedFields] = useState<{ provider?: string | null; locator?: string | null; flight_route?: string | null; departure_date?: string | null }>({});
  const [linkedReservationLabel, setLinkedReservationLabel] = useState<string | null>(null);
  const [manualReservationId, setManualReservationId] = useState<string>(""); // user override
  // Fecha de vencimiento opcional (visa/pasaporte/seguro). Si el user no ingresa
  // nada, queda null. Persiste a attachments.expires_at (migración 00037).
  const [uploadExpiresAt, setUploadExpiresAt] = useState<string>("");

  useEffect(() => { isNative().then(setNativeAvailable); }, []);
  useEffect(() => { estimateVaultUsage().then(setUsage).catch(() => {}); }, [files]);

  // Load attachments — online viene del hook TanStack; demo todavía depende
  // de `readVersioned` porque el flujo de upload escribe blobs en IndexedDB +
  // metadata versionada en localStorage (Iter 3 unifica).
  useEffect(() => {
    if (!trip) return;
    if (mode === "online") {
      if (attachmentsRaw) {
        setFiles(attachmentsRaw);
        setLoading(attachmentsLoading);
      } else {
        setLoading(attachmentsLoading);
      }
      return;
    }
    // Demo: versioned localStorage read — sobrevive esquemas previos y data corrupta.
    let cancelled = false;
    const key = `travel-os-vault-${trip.id}`;
    const initial = readVersioned<Attachment[]>(key, VAULT_SCHEMA, migrateVault) ?? [];
    queueMicrotask(() => { if (!cancelled) { setFiles(initial); setLoading(false); } });
    return () => { cancelled = true; };
  }, [trip, mode, attachmentsRaw, attachmentsLoading]);

  // Preview URL: tracked as a side effect of selectedFile in a ref-safe way.
  // We DERIVE the preview url via useMemo + cleanup hook to keep React happy.
  useEffect(() => {
    if (!selectedFile || !selectedFile.type.startsWith("image/")) return;
    const url = URL.createObjectURL(selectedFile);
    queueMicrotask(() => setPreviewUrl(url));
    return () => {
      URL.revokeObjectURL(url);
      queueMicrotask(() => setPreviewUrl(null));
    };
  }, [selectedFile]);

  const onPickFile = useCallback(async (f: File | null) => {
    setSelectedFile(f);
    setLastClassification(null);
    if (!f) return;
    setUploadName(f.name.replace(/\.[^.]+$/, ""));

    if (!classifyAuto) return;
    // Auto-classify with Claude vision. Falls back to filename heuristic if no key.
    setClassifying(true);
    try {
      const isClassifiable = f.type.startsWith("image/") || f.type === "application/pdf";
      if (!isClassifiable) { setClassifying(false); return; }
      // FileReader.readAsDataURL hace el base64 en el thread de I/O del browser
      // — no bloquea el main thread como el loop `String.fromCharCode + btoa`
      // que estaba antes (que era O(n) JS sync y se notaba mucho en imágenes
      // >2MB capturadas desde la cámara nativa).
      const data_base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || "");
          // dataURL es "data:<mime>;base64,<payload>" — sólo nos queda con payload.
          const comma = result.indexOf(",");
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
        reader.readAsDataURL(f);
      });
      const base = process.env.NEXT_PUBLIC_API_BASE_URL || "";
      const res = await fetch(`${base}/api/classify-document`, {
        method: "POST",
        headers: withApiKeyHeaders(),
        body: JSON.stringify({ data_base64, mime: f.type, file_name: f.name }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json() as {
        category: string; confidence: string; suggested_name: string;
        extracted: { provider?: string; locator?: string; flight_route?: string; departure_date?: string; arrival_date?: string };
        is_critical: boolean; source: string;
      };
      if (result.suggested_name) setUploadName(result.suggested_name);
      if (result.category && result.category !== "other") setUploadCategory(result.category);
      const noteParts: string[] = [];
      if (result.extracted.provider) noteParts.push(result.extracted.provider);
      if (result.extracted.flight_route) noteParts.push(result.extracted.flight_route);
      if (result.extracted.locator) noteParts.push(`${t.vault.locationShort} ${result.extracted.locator}`);
      if (noteParts.length) setUploadNotes(noteParts.join(" · "));
      setLastClassification(`${result.source === "claude" ? "IA" : "heurística"} · ${result.category} · ${result.confidence}`);
      track(EVENTS.VAULT_CLASSIFY, { category: result.category, confidence: result.confidence, source: result.source });
      setExtractedFields({
        provider: result.extracted.provider,
        locator: result.extracted.locator,
        flight_route: result.extracted.flight_route,
        departure_date: result.extracted.departure_date,
      });

      // Pre-emptive match preview (does NOT save anything; just shows the user we found a match)
      if (reservations && reservations.length) {
        const match = findBestReservationMatch(result.extracted, reservations);
        if (match) {
          setLinkedReservationLabel(`${match.reservation.provider} · ${match.reservation.description.substring(0, 50)}`);
        } else {
          setLinkedReservationLabel(null);
        }
      }
    } catch (e) {
      console.error("classify failed:", e);
      setLastClassification(null);
    } finally {
      setClassifying(false);
    }
  }, [classifyAuto, reservations]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile || !trip) return;
    setUploading(true);
    track(EVENTS.VAULT_UPLOAD, { category: uploadCategory, size_kb: Math.round(selectedFile.size / 1024) });

    if (mode === "online" && client) {
      // RLS de attachments es `user_id = auth.uid()`. Cuando el uploader es
      // un editor invitado al trip (no el owner), trip.user_id != auth.uid()
      // → RLS rechaza. Obtenemos el caller real de la sesión ANTES de subir
      // para usar su id en el storage path también (consistente con la policy
      // de storage que matchea por prefix `<auth.uid()>/...`).
      const { data: { user: callerUser } } = await client.auth.getUser();
      if (!callerUser) { toast("Sesión expirada. Volvé a hacer login.", "error"); setUploading(false); return; }
      const path = `${callerUser.id}/${trip.id}/${Date.now()}_${selectedFile.name}`;
      const { error: uploadErr } = await client.storage.from("travel-vault").upload(path, selectedFile);
      if (uploadErr) { toast(uploadErr.message, "error"); setUploading(false); return; }
      // Manual override > IA match
      const manual = manualReservationId ? reservations?.find(r => r.id === manualReservationId) : null;
      const match = manual ? { reservation: manual } : (reservations?.length ? findBestReservationMatch(extractedFields, reservations) : null);
      try {
        await addAttachment({
          trip_id: trip.id,
          user_id: callerUser.id,
          entity_type: match ? "reservation" : "trip",
          entity_id: match ? match.reservation.id : trip.id,
          category: uploadCategory as Attachment["category"],
          file_name: uploadName || selectedFile.name,
          file_type: selectedFile.type,
          file_size: selectedFile.size,
          storage_path: path,
          is_favorite: false,
          is_critical: false,
          available_offline: false,
          notes: uploadNotes || null,
          expires_at: uploadExpiresAt || null,
        });
      } catch (e) {
        toast((e as Error).message, "error");
        setUploading(false);
        return;
      }
      // TanStack invalida [attachments, mode, trip.id] → el effect de arriba
      // se vuelve a disparar con la nueva data y `files` se actualiza solo.
      void refetchAttachments();
    } else {
      // Demo mode: save real bytes in IndexedDB + metadata in localStorage
      const id = crypto.randomUUID();
      try {
        await saveVaultBlob(id, selectedFile);
      } catch (e) {
        toast(`No se pudo guardar el archivo: ${(e as Error).message}`, "error");
        setUploading(false);
        return;
      }
      const isCritical = uploadCategory === "boarding_pass" || uploadCategory === "identity" || uploadCategory === "insurance";
      let newFile: Attachment = {
        id, trip_id: trip.id, user_id: "demo",
        entity_type: "trip", entity_id: trip.id, category: uploadCategory as Attachment["category"],
        file_name: uploadName || selectedFile.name,
        file_type: selectedFile.type, file_size: selectedFile.size,
        storage_path: `idb:${id}`, is_favorite: false, is_critical: isCritical,
        available_offline: true, notes: uploadNotes || null,
        expires_at: uploadExpiresAt || null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };

      // Manual override > IA match
      const manualR = manualReservationId ? reservations?.find(r => r.id === manualReservationId) : null;
      if (manualR) {
        newFile = linkAttachmentToReservation(newFile, manualR);
      } else if (reservations && reservations.length) {
        const match = findBestReservationMatch(extractedFields, reservations);
        if (match) newFile = linkAttachmentToReservation(newFile, match.reservation);
      }

      const updated = [newFile, ...files];
      setFiles(updated);
      writeVersioned(`travel-os-vault-${trip.id}`, VAULT_SCHEMA, updated);
      haptic("medium");
    }

    setSelectedFile(null); setUploadName(""); setUploadNotes("");
    setExtractedFields({}); setLinkedReservationLabel(null);
    setManualReservationId(""); setUploadExpiresAt("");
    setShowUpload(false); setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [selectedFile, trip, client, mode, uploadCategory, uploadNotes, uploadName, uploadExpiresAt, files, reservations, extractedFields, manualReservationId, addAttachment, refetchAttachments]);

  const toggleFavorite = useCallback(async (att: Attachment) => {
    if (mode === "online" && client && trip) {
      // Pasa por la mutation centralizada → invalida cache, mantiene paridad
      // con el resto de mutadores (addAttachment/deleteAttachment) y elimina
      // el `client.from("attachments").update(...)` ad-hoc. UI re-renderea
      // cuando TanStack rehidrata `attachmentsRaw`.
      await updateAttachmentMut(att.id, { is_favorite: !att.is_favorite }, trip.id);
    } else {
      const updated = files.map(f => f.id === att.id ? { ...f, is_favorite: !f.is_favorite } : f);
      setFiles(updated);
      if (trip) writeVersioned(`travel-os-vault-${trip.id}`, VAULT_SCHEMA, updated);
    }
  }, [client, mode, files, trip, updateAttachmentMut]);

  const deleteFile = useCallback(async (att: Attachment) => {
    const ok = await confirm({
      title: `¿Eliminar "${att.file_name}"?`,
      message: "Esta acción no se puede deshacer.",
      destructive: true,
    });
    if (!ok) return;
    if (mode === "online" && client) {
      await client.storage.from("travel-vault").remove([att.storage_path]);
      await deleteAttachmentMut({ id: att.id, tripId: trip?.id });
      // Mutation invalida cache; el effect resincroniza `files` via attachmentsRaw.
    } else {
      if (att.storage_path.startsWith("idb:")) await deleteVaultBlob(att.id).catch(() => {});
      const updated = files.filter(f => f.id !== att.id);
      setFiles(updated);
      if (trip) writeVersioned(`travel-os-vault-${trip.id}`, VAULT_SCHEMA, updated);
    }
  }, [client, mode, files, trip, deleteAttachmentMut, confirm]);

  const handleOpen = useCallback(async (att: Attachment) => {
    if (att.storage_path.startsWith("idb:")) {
      await openVaultBlob(att.id, att.file_name);
    } else if (mode === "online" && client) {
      const { data } = await client.storage.from("travel-vault").createSignedUrl(att.storage_path, 600);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    }
  }, [client, mode]);

  const handleDownload = useCallback(async (att: Attachment) => {
    if (att.storage_path.startsWith("idb:")) {
      await downloadVaultBlob(att.id, att.file_name);
    } else if (mode === "online" && client) {
      const { data } = await client.storage.from("travel-vault").download(att.storage_path);
      if (!data) return;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url; a.download = att.file_name;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }, [client, mode]);

  const filtered = useMemo(() => {
    let r = files;
    if (focusedFileId) r = r.filter(f => f.id === focusedFileId);
    else if (focusedCategory) r = r.filter(f => f.category === focusedCategory);
    else if (filter === "favorites") r = r.filter(f => f.is_favorite);
    else if (filter === "critical") r = r.filter(f => f.is_critical);
    else if (filter !== "all") r = r.filter(f => f.category === filter);
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(f => f.file_name.toLowerCase().includes(q) || (f.notes || "").toLowerCase().includes(q));
    }
    return r;
  }, [files, filter, search, focusedFileId, focusedCategory]);

  const catLabel = (cat: string) => t.vault.categories[cat as keyof typeof t.vault.categories] || cat;

  if (loading) return <div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted rounded-lg" />)}</div>;

  return (
    <div className="space-y-4 pb-20 lg:pb-0 animate-fade-in" role="region" aria-label={t.vault.ariaLabel}>
      <LargeTitle
        eyebrow={`${files.length} pases · ${formatSize(usage.bytes)}${mode === "demo" ? " · solo en este iPhone" : ""}`}
        title={t.vault.title}
        serif
      />

      {/* ─── Primary CTAs — el filo del producto: subir manual O reenviar email ─── */}
      <div className="px-4 mb-6 space-y-2.5">
        <button
          onClick={() => setShowUpload(true)}
          className="pressable w-full flex items-center justify-center gap-3 h-14 rounded-2xl text-white font-semibold text-[15px] shadow-md tampu-gradient-warm"
          aria-label={t.vault.uploadSheetTitle}
        >
          <Plus className="w-5 h-5" strokeWidth={2.4} aria-hidden />
          {files.length === 0 ? t.vault.uploadFirst : t.vault.upload}
        </button>
        {/* CTA secundaria: la feature 10x */}
        <Link
          href="/import"
          className="pressable w-full flex items-center justify-center gap-2.5 h-12 rounded-2xl text-[14px] font-semibold text-primary border-2 border-primary/30 hover:bg-primary/5 transition-colors"
          aria-label="Importar un email de confirmación"
        >
          <Sparkles className="w-4 h-4" aria-hidden />
          o reenvialo desde un email
        </Link>
        <p className="text-[11px] text-muted-foreground text-center pt-1">
          PDF, foto, o el cuerpo de un email · todo queda <strong>offline en este dispositivo</strong>
        </p>
      </div>

      {/* ─── Wallet stack — vertical, Apple Wallet style with peek ─── */}
      {files.length > 0 && (() => {
        const critical = files.filter(f => f.is_critical || f.is_favorite).slice(0, 5);
        if (critical.length === 0) return null;
        // Wallet palette — TODA en familia tierra Tampu. 8 categorías = 8 variaciones.
        // OKLCH para control fino: lightness sube de 0.20 (base) a 0.55 (cresta).
        // Boarding pass = índigo profundo (es el único caso donde un azul oscuro tiene sentido,
        // evoca cielo puneño nocturno); identity = cardón verde; insurance = cobre;
        // reservation = terracota; transport = canela; receipt = mostaza tostada; health = carmín; other = piedra.
        const colorByCategory: Record<string, string> = {
          boarding_pass:  "linear-gradient(140deg, oklch(0.22 0.04 240) 0%, oklch(0.36 0.10 240) 60%, oklch(0.55 0.12 220) 100%)",
          identity:       "linear-gradient(140deg, oklch(0.22 0.04 150) 0%, oklch(0.36 0.09 150) 60%, oklch(0.55 0.13 145) 100%)",
          insurance:      "linear-gradient(140deg, oklch(0.22 0.04 55)  0%, oklch(0.36 0.11 55)  60%, oklch(0.55 0.16 55)  100%)",
          reservation:    "linear-gradient(140deg, oklch(0.22 0.04 38)  0%, oklch(0.40 0.12 38)  60%, oklch(0.62 0.17 38)  100%)",
          transport:      "linear-gradient(140deg, oklch(0.22 0.04 28)  0%, oklch(0.38 0.10 28)  60%, oklch(0.58 0.14 28)  100%)",
          receipt:        "linear-gradient(140deg, oklch(0.22 0.04 78)  0%, oklch(0.42 0.11 78)  60%, oklch(0.65 0.14 70)  100%)",
          health:         "linear-gradient(140deg, oklch(0.22 0.04 22)  0%, oklch(0.40 0.14 22)  60%, oklch(0.58 0.18 25)  100%)",
          other:          "linear-gradient(140deg, oklch(0.22 0.020 35) 0%, oklch(0.36 0.020 38) 60%, oklch(0.52 0.020 50) 100%)",
        };
        return (
          <section className="px-4 mt-2 mb-8">
            <p className="ios-eyebrow">{t.vault.featuredPasses}</p>
            <div className="relative" style={{ paddingBottom: critical.length > 1 ? `${(critical.length - 1) * 14}px` : 0 }}>
              {critical.map((f, i) => {
                const gradient = colorByCategory[f.category] || colorByCategory.other;
                // Apple Wallet vertical stack with peek — each card overlaps the previous
                return (
                  <div
                    key={f.id}
                    className="relative"
                    style={{ marginTop: i === 0 ? 0 : "-128px", zIndex: i + 1 }}
                  >
                    <WalletCard
                      title={f.file_name.replace(/\.[^.]+$/, "")}
                      subtitle={f.notes || catLabel(f.category)}
                      badge={catLabel(f.category)}
                      gradient={gradient}
                      icon={<FileIcon className="w-5 h-5" />}
                      onClick={() => handleOpen(f)}
                      status={f.is_critical ? "ok" : undefined}
                      footer={f.available_offline ? "Disponible offline" : undefined}
                    />
                  </div>
                );
              })}
            </div>
            {critical.length > 1 && (
              <p className="text-[11px] text-muted-foreground text-center mt-3">
                {t.vault.tapToOpen}
              </p>
            )}
          </section>
        );
      })()}

      {(focusedFileId || focusedCategory) && (
        <Card className="border-l-4 border-l-primary bg-primary/5">
          <CardContent className="p-3 text-xs flex items-center justify-between gap-2">
            <span>
              <Sparkles className="w-3 h-3 inline mr-1" />
              {focusedFileId ? "Filtro por archivo (deep-link del Asistente)" : `Filtro por categoría: ${focusedCategory}`}
            </span>
            <Link href="/vault" className="text-primary underline">Ver todo</Link>
          </CardContent>
        </Card>
      )}

      <Sheet open={showUpload} onClose={() => setShowUpload(false)} title={t.vault.uploadSheetTitle}>
        <div className="space-y-4 pb-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*"
              className="hidden"
              onChange={e => onPickFile(e.target.files?.[0] || null)}
            />

            {selectedFile ? (
              <div className="rounded-md border bg-card overflow-hidden">
                {previewUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={previewUrl} alt="preview" className="w-full max-h-48 object-contain bg-muted/20" />
                ) : (
                  <div className="flex items-center justify-center gap-2 h-20 bg-muted/20">
                    <FileIcon className="w-6 h-6 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{selectedFile.type || "archivo"}</span>
                  </div>
                )}
                <div className="p-2 text-xs flex items-center justify-between">
                  <span className="truncate flex-1">{selectedFile.name}</span>
                  <span className="text-muted-foreground ml-2 whitespace-nowrap">{formatSize(selectedFile.size)}</span>
                  <button onClick={() => { onPickFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="ml-2 text-muted-foreground hover:text-destructive" aria-label="Quitar archivo">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button variant="outline" className="w-full gap-2 h-16 border-dashed" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4" /> Elegir archivo (PDF / Imagen)
                </Button>
                {nativeAvailable && (
                  <Button variant="outline" className="w-full gap-2 h-16 border-dashed" onClick={async () => {
                    haptic("light");
                    const photo = await capturePhoto({ source: "camera" });
                    if (photo?.dataUrl) {
                      const r = await fetch(photo.dataUrl);
                      const blob = await r.blob();
                      const f = new File([blob], `scan-${Date.now()}.${photo.format || "jpg"}`, { type: blob.type });
                      onPickFile(f);
                    }
                  }}>
                    <Camera className="w-4 h-4" /> Escanear con cámara
                  </Button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="sm:col-span-2">
                <label className="text-[10px] uppercase text-muted-foreground">{t.vault.name}</label>
                <Input value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder={t.vault.namePlaceholder} className="mt-1" />
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">{t.vault.category}</label>
                <SelectNative value={uploadCategory} onChange={e => setUploadCategory(e.target.value)} className="mt-1">
                  {CATEGORIES.map(c => <option key={c} value={c}>{catLabel(c)}</option>)}
                </SelectNative>
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">{t.vault.notes}</label>
                <Input value={uploadNotes} onChange={e => setUploadNotes(e.target.value)} placeholder="..." className="mt-1" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] uppercase text-muted-foreground">{t.vault.expiresAt}</label>
                <Input
                  type="date"
                  value={uploadExpiresAt}
                  onChange={e => setUploadExpiresAt(e.target.value)}
                  className="mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-1">{t.vault.expiresAtHint}</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={classifyAuto} onChange={e => setClassifyAuto(e.target.checked)} />
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                {t.vault.classifyAI}
              </label>
              {classifying && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> {t.vault.analyzing}
                </span>
              )}
              {!classifying && lastClassification && (
                <span className="text-success flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> {lastClassification}
                </span>
              )}
            </div>

            {linkedReservationLabel && !manualReservationId && (
              <div className="rounded-md bg-success/10 border border-success/30 p-2 text-xs flex items-start gap-2">
                <Sparkles className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">{t.vault.autoLinkTo}:</p>
                  <p className="text-muted-foreground">{linkedReservationLabel}</p>
                </div>
              </div>
            )}

            {/* Manual override — siempre disponible para que el user pueda forzar la reserva */}
            {reservations && reservations.length > 0 && (
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">
                  Vincular a reserva {linkedReservationLabel ? "(override manual)" : "(opcional)"}
                </label>
                <SelectNative
                  value={manualReservationId}
                  onChange={e => setManualReservationId(e.target.value)}
                  className="mt-1"
                >
                  <option value="">— {linkedReservationLabel ? "Usar match automático" : "Sin vincular"} —</option>
                  {reservations
                    .filter(r => r.status !== "cancelled" && r.status !== "expired")
                    .sort((a, b) => (a.use_date || "").localeCompare(b.use_date || ""))
                    .map(r => (
                      <option key={r.id} value={r.id}>
                        [{r.type}] {r.provider} · {r.description.substring(0, 60)}{r.locator ? ` (${r.locator})` : ""}
                      </option>
                    ))}
                </SelectNative>
              </div>
            )}

            <Button onClick={handleUpload} size="lg" className="w-full" disabled={!selectedFile || uploading || classifying}>
              {uploading ? t.common.loading : `Guardar en ${t.nav.vault}`}
            </Button>
            <p className="text-[10px] text-muted-foreground">
              {classifyAuto
                ? "Al subir, la IA lee el documento, lo clasifica (pase de embarque, pasaporte, seguro, recibo) y extrae datos (vuelo, localizador, fechas) en segundos."
                : "Clasificación manual. Activá la IA para que rellene los campos automáticamente."}
            </p>
        </div>
      </Sheet>

      {/* Filters */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={t.common.search} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: "all", label: t.vault.allFiles },
            { key: "favorites", label: t.vault.favorites },
            { key: "critical", label: t.vault.critical },
            ...CATEGORIES.map(c => ({ key: c, label: catLabel(c) })),
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${filter === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="space-y-3 px-1">
          <EmptyState
            title={files.length === 0 ? "Sin archivos todavía" : t.common.noResults}
            description={files.length === 0 ? "Tocá 'Subir' y arrastrá tu primer pase de embarque, pasaporte o seguro. PDF o imagen, ambos van." : undefined}
            icon={<FileText className="w-8 h-8" />}
            action={files.length === 0 ? <Button onClick={() => setShowUpload(true)}>Subir documento</Button> : undefined}
          />
          {files.length === 0 && <HintCard hintId="vault-empty" delay={150} />}
          {files.length === 0 && <HintCard hintId="offline-tip" delay={300} />}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(att => (
            <VaultRow
              key={att.id}
              att={att}
              onOpen={() => handleOpen(att)}
              onDownload={() => handleDownload(att)}
              onToggleFavorite={() => toggleFavorite(att)}
              onDelete={() => deleteFile(att)}
              formatDate={formatDate}
              catLabel={catLabel}
            />
          ))}
        </div>
      )}

      {/* Retention info footer */}
      <div className="px-4 pt-8 pb-2">
        <div className="ios-card p-4">
          <p className="text-[12px] font-semibold mb-1.5">{t.vault.retentionFaq}</p>
          <p className="text-[11.5px] text-muted-foreground leading-relaxed">
            Viven <strong>indefinidamente</strong> en este dispositivo (en IndexedDB privada del navegador / app),
            mientras no los borres manualmente, no desinstales la app y no limpies los datos del sitio.
            iOS/Android pueden purgar storage si el dispositivo se queda sin espacio,
            pero requiere extremo agotamiento (~10% libre o menos).
            {mode === "demo"
              ? " Como estás en modo demo, todo es local — no hay servidor."
              : " En modo online, además se sincronizan con tu cuenta."}
          </p>
        </div>
      </div>
      {confirmSheet}
    </div>
  );
}

function VaultRow({ att, onOpen, onDownload, onToggleFavorite, onDelete, formatDate, catLabel }: {
  att: Attachment;
  onOpen: () => void;
  onDownload: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  formatDate: (d: string, s?: "short" | "long" | "iso") => string;
  catLabel: (c: string) => string;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  const isImage = att.file_type.startsWith("image/");

  useEffect(() => {
    if (!isImage) return;
    if (!att.storage_path.startsWith("idb:")) return;
    let cancelled = false;
    getVaultDataUrl(att.id).then(url => { if (!cancelled) setThumb(url); }).catch(() => {});
    return () => { cancelled = true; };
  }, [att.id, att.storage_path, isImage]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <div className="shrink-0 w-12 h-12 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
          {thumb ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={thumb} alt={att.file_name || "documento"} className="w-full h-full object-cover" loading="lazy" decoding="async" />
          ) : isImage ? (
            <ImageIcon className="w-5 h-5 text-muted-foreground" />
          ) : att.file_type.includes("pdf") ? (
            <FileText className="w-5 h-5" style={{ color: "oklch(0.42 0.18 22)" }} />
          ) : (
            <FileIcon className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpen}>
          <p className="text-sm font-medium truncate">{att.file_name}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground">{catLabel(att.category)}</span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">{(att.file_size / 1024).toFixed(0)} KB</span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">{formatDate(att.created_at)}</span>
          </div>
        </div>
        {/* Action cluster — touch targets 44x44pt mínimo (iOS HIG).
            Antes: p-1.5 + w-4 h-4 icon = ~28x28 hit area (sub-44 = fail accessibility audit).
            Ahora: w-11 h-11 = 44x44 cada botón, con ícono w-4 h-4 centrado. */}
        <div className="shrink-0 flex items-center gap-0.5" role="group" aria-label="Acciones del archivo">
          {att.is_critical && <Shield className="w-3.5 h-3.5 mr-1" style={{ color: "oklch(0.42 0.18 22)" }} aria-label="Crítico" />}
          <button
            onClick={onOpen}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            title="Abrir" aria-label={`Abrir ${att.file_name}`}
          >
            <Eye className="w-4 h-4" aria-hidden />
          </button>
          <button
            onClick={onDownload}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            title="Descargar" aria-label={`Descargar ${att.file_name}`}
          >
            <Download className="w-4 h-4" aria-hidden />
          </button>
          <button
            onClick={onToggleFavorite}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-warning hover:bg-warning/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning"
            title={att.is_favorite ? "Quitar de favoritos" : "Marcar favorito"}
            aria-label={att.is_favorite ? "Quitar de favoritos" : "Marcar favorito"}
            aria-pressed={att.is_favorite}
          >
            {att.is_favorite ? <Star className="w-4 h-4 text-warning fill-warning" aria-hidden /> : <StarOff className="w-4 h-4" aria-hidden />}
          </button>
          <button
            onClick={onDelete}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive"
            title="Eliminar" aria-label={`Eliminar ${att.file_name}`}
          >
            <Trash2 className="w-4 h-4" aria-hidden />
          </button>
        </div>
      </div>
    </Card>
  );
}
