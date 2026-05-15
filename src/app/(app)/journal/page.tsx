"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { LargeTitle, Sheet } from "@/components/ios";
import { EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useActiveTrip } from "@/lib/hooks/use-trip-data";
import { useSupabase } from "@/lib/context/supabase-provider";
import { useI18n } from "@/i18n/provider";
import { saveVaultBlob, deleteVaultBlob, getVaultDataUrl } from "@/lib/vault/storage";
import { capturePhoto, haptic, isNative, captureLocation } from "@/lib/native/platform";
import { toast } from "@/components/ios/toast";
import { readVersioned, writeVersioned } from "@/lib/storage/version";
import { toggleLikeRemote, insertCommentRemote, deleteCommentRemote } from "@/lib/journal/sync";
import { HintCard } from "@/components/ios/hint-card";
import { PrintBookSheet } from "@/components/journal/PrintBookSheet";
import {
  Camera, Plus, BookOpen, Trash2, MapPin, X, Heart, MessageCircle,
  Plane, Utensils, Send, ChevronLeft, ChevronRight,
} from "lucide-react";

/**
 * Journal blog — timeline tipo Polarsteps + Instagram.
 *
 * Cambios (mayo 2026):
 *  - Layout pasa de grid 3-col a TIMELINE vertical estilo blog (1 post = 1 card grande).
 *  - 2 categorías obligatorias: "Viaje" (paisajes, momentos) y "Foodie" (platos del viaje, key t.journal.foodie).
 *  - Likes locales (toggle de un corazón guardado por entry).
 *  - Comentarios locales (uno por persona, multilínea, persistente).
 *  - Geocoding inverso al cargar foto: muestra el nombre del lugar (no solo lat/lon).
 *  - Filtro por categoría (Todo / Viaje / Foodie).
 *  - Schema versionado (v2 — incluye los nuevos campos category, likes, comments, place).
 *
 * Para una versión social futura: cuando el modo online esté activado y el usuario
 * tenga login Supabase, likes/comments se sincronizan entre usuarios con RLS por trip
 * compartido. Por ahora todo es self (likes y comments del mismo usuario).
 */

const STORE_KEY_PREFIX = "travel-os-journal-";
const JOURNAL_SCHEMA = 3;

// Mayo 2026: ahora el journal también es review system del viajero.
// "trip" = paisaje / momento; "food" = comida (con review opcional);
// "attraction" = atracción turística (con rating); "stay" = alojamiento.
type EntryCategory = "trip" | "food" | "attraction" | "stay";

interface Comment {
  id: string;
  ts: number;
  author: string;
  body: string;
}

interface JournalEntry {
  id: string;
  trip_id: string;
  ts: number;
  caption: string;
  category: EntryCategory;
  lat?: number;
  lon?: number;
  place?: string;
  liked: boolean;
  comments: Comment[];
  // ─── Review fields (nuevos en v3) ───
  /** Rating 1-5 estrellas — opcional, solo aplica a food/attraction/stay */
  rating?: number;
  /** Solo para food: $-$$$$ basado en cubierto típico */
  price_level?: 1 | 2 | 3 | 4;
  /** Nombre del lugar — restaurante / atracción / hotel */
  place_name?: string;
}

// Schema migration: v0/v1 entries didn't have category/liked/comments/place.
// v2 → v3 agrega rating/price_level/place_name. Backfill seguro.
function migrateJournal(data: unknown): JournalEntry[] | null {
  if (!Array.isArray(data)) return null;
  return (data as Partial<JournalEntry>[]).map((e) => ({
    id: e.id as string,
    trip_id: e.trip_id as string,
    ts: (e.ts as number) ?? Date.now(),
    caption: (e.caption as string) ?? "",
    category: (e.category as EntryCategory) ?? "trip",
    lat: e.lat,
    lon: e.lon,
    place: e.place,
    liked: (e.liked as boolean) ?? false,
    comments: Array.isArray(e.comments) ? (e.comments as Comment[]) : [],
    rating: e.rating,
    price_level: e.price_level as 1 | 2 | 3 | 4 | undefined,
    place_name: e.place_name,
  }));
}

function loadEntries(tripId: string): JournalEntry[] {
  return readVersioned<JournalEntry[]>(STORE_KEY_PREFIX + tripId, JOURNAL_SCHEMA, migrateJournal) ?? [];
}

function saveEntries(tripId: string, entries: JournalEntry[]): void {
  writeVersioned(STORE_KEY_PREFIX + tripId, JOURNAL_SCHEMA, entries);
  if (typeof window !== "undefined") {
    // Iter 6: renombramos el event a "tampu-vault-change" pero seguimos emitiendo
    // el legacy "travel-os-vault-change" para no romper listeners en backup.ts,
    // demo-store.ts, papua-seoul-trip.ts y attach-doc-button.tsx que todavía
    // escuchan el antiguo. Migrar esos listeners al nuevo event y borrar este
    // bridge en una iteración futura.
    window.dispatchEvent(new Event("tampu-vault-change"));
    window.dispatchEvent(new Event("travel-os-vault-change"));
  }
}

/**
 * Reverse geocoding via Nominatim (OpenStreetMap). Sin key, free for personal use.
 * Devuelve algo como "Palermo, Buenos Aires" o null si falla.
 */
async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`,
      { headers: { "Accept-Language": "es,en;q=0.9" } }
    );
    if (!r.ok) return null;
    const data = await r.json() as {
      address?: { suburb?: string; neighbourhood?: string; village?: string; town?: string; city?: string; country?: string };
    };
    const a = data.address || {};
    const local = a.suburb || a.neighbourhood || a.village || a.town;
    const city = a.city || a.town || a.village;
    if (local && city && local !== city) return `${local}, ${city}`;
    if (city && a.country) return `${city}, ${a.country}`;
    return city || a.country || null;
  } catch {
    return null;
  }
}

export default function JournalPage() {
  const { data: trip } = useActiveTrip();
  const { client, mode } = useSupabase();
  const { formatDate, t } = useI18n();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [openEntry, setOpenEntry] = useState<JournalEntry | null>(null);
  const [filter, setFilter] = useState<"all" | EntryCategory>("all");
  const [nativeAvail, setNativeAvail] = useState(false);
  const [newCategory, setNewCategory] = useState<EntryCategory>("trip");
  const [commentDraft, setCommentDraft] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { isNative().then(setNativeAvail); }, []);

  // Capturar user_id para remote sync
  useEffect(() => {
    if (mode !== "online" || !client) return;
    client.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
  }, [client, mode]);

  useEffect(() => {
    if (!trip) return;
    const next = loadEntries(trip.id);
    queueMicrotask(() => setEntries(next));
  }, [trip]);

  // Load thumbnails from IndexedDB
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, string> = { ...thumbs };
      for (const e of entries) {
        if (out[e.id]) continue;
        const url = await getVaultDataUrl(e.id).catch(() => null);
        if (url) out[e.id] = url;
        if (!alive) return;
      }
      if (alive) setThumbs(out);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const filtered = useMemo(() => {
    return filter === "all" ? entries : entries.filter((e) => e.category === filter);
  }, [entries, filter]);

  // Paginación: mostrar 15 fotos a la vez. "Cargar más" suma 15.
  // En lugar de virtualización full (overkill para journals de viaje típicos < 200 entries),
  // un simple page-size + button es suficiente y mantiene scroll position perfecto.
  const [visibleCount, setVisibleCount] = useState(15);
  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;
  // Resetear al cambiar filtro
  useEffect(() => { setVisibleCount(15); }, [filter]);

  const stats = useMemo(() => {
    const tripCount = entries.filter((e) => e.category === "trip").length;
    const foodCount = entries.filter((e) => e.category === "food").length;
    const places = new Set(entries.map((e) => e.place).filter(Boolean)).size;
    return { trip: tripCount, food: foodCount, places };
  }, [entries]);

  const addEntry = useCallback(async (blob: Blob, category: EntryCategory) => {
    if (!trip) return;
    const id = crypto.randomUUID();
    try {
      await saveVaultBlob(id, blob);
    } catch (e) {
      toast("No pude guardar la foto: " + (e as Error).message, "error");
      return;
    }
    const loc = await captureLocation().catch(() => null);

    const entry: JournalEntry = {
      id,
      trip_id: trip.id,
      ts: Date.now(),
      caption: "",
      category,
      lat: loc?.lat,
      lon: loc?.lng,
      liked: false,
      comments: [],
    };

    // Reverse geocode si tenemos coords (no bloquea: rellena después)
    if (loc) {
      reverseGeocode(loc.lat, loc.lng).then((place) => {
        if (!place) return;
        setEntries((prev) => {
          const next = prev.map((e) => (e.id === id ? { ...e, place } : e));
          if (trip) saveEntries(trip.id, next);
          return next;
        });
      });
    }

    const next = [entry, ...entries];
    setEntries(next);
    saveEntries(trip.id, next);
    haptic("medium");
    toast(`${category === "food" ? t.journal.foodie : "Foto"} ${t.journal.addedToDiary}`, "success");
  }, [trip, entries]);

  const handleFile = useCallback(async (file: File | null, category: EntryCategory) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Solo imágenes (JPG/PNG/HEIC)", "warn");
      return;
    }
    await addEntry(file, category);
  }, [addEntry]);

  const handleCamera = useCallback(async (category: EntryCategory) => {
    haptic("light");
    const photo = await capturePhoto({ source: "camera" });
    if (photo?.dataUrl) {
      const r = await fetch(photo.dataUrl);
      const b = await r.blob();
      await addEntry(b, category);
    }
  }, [addEntry]);

  const toggleLike = useCallback((entry: JournalEntry) => {
    if (!trip) return;
    haptic("light");
    const nextLiked = !entry.liked;
    const next = entries.map((e) => (e.id === entry.id ? { ...e, liked: nextLiked } : e));
    setEntries(next);
    saveEntries(trip.id, next);
    if (openEntry?.id === entry.id) {
      setOpenEntry({ ...openEntry, liked: nextLiked });
    }
    // Mirror a Supabase si online
    if (mode === "online" && client && userId) {
      toggleLikeRemote({ client, tripId: trip.id, entryId: entry.id, userId }, nextLiked);
    }
  }, [trip, entries, openEntry, mode, client, userId]);

  const updateCaption = useCallback((entry: JournalEntry, caption: string) => {
    if (!trip) return;
    const next = entries.map((e) => (e.id === entry.id ? { ...e, caption } : e));
    setEntries(next);
    saveEntries(trip.id, next);
  }, [trip, entries]);

  // Debounced caption save — antes saveEntries se ejecutaba por keystroke
  // (writeVersioned + dispatchEvent) y producía jank en captions largas.
  // Debounce 300ms: el setOpenEntry sigue siendo síncrono (UI responsive)
  // pero la persistencia espera a que el user pare de tipear.
  const captionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCaptionChange = useCallback((entry: JournalEntry, value: string) => {
    setOpenEntry({ ...entry, caption: value });
    if (captionTimer.current) clearTimeout(captionTimer.current);
    captionTimer.current = setTimeout(() => {
      updateCaption(entry, value);
    }, 300);
  }, [updateCaption]);

  // Cleanup del timer al desmontar para evitar que un save tardío se ejecute
  // sobre un trip ya cambiado.
  useEffect(() => {
    return () => {
      if (captionTimer.current) clearTimeout(captionTimer.current);
    };
  }, []);

  const addComment = useCallback((entry: JournalEntry, body: string) => {
    if (!trip || !body.trim()) return;
    const comment: Comment = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      author: "Tú",
      body: body.trim(),
    };
    const updatedEntry = { ...entry, comments: [...entry.comments, comment] };
    const next = entries.map((e) => (e.id === entry.id ? updatedEntry : e));
    setEntries(next);
    saveEntries(trip.id, next);
    setOpenEntry(updatedEntry);
    setCommentDraft("");
    haptic("light");
    if (mode === "online" && client && userId) {
      insertCommentRemote(
        { client, tripId: trip.id, entryId: entry.id, userId },
        { id: comment.id, body: comment.body, ts: comment.ts },
      );
    }
  }, [trip, entries, mode, client, userId]);

  /**
   * Actualizá los campos de review (rating, price_level, place_name, category).
   * Cuando el user marca estrellas o $, se persisten local + se reflejan en la UI.
   */
  const updateReview = useCallback(
    (entry: JournalEntry, patch: Partial<Pick<JournalEntry, "rating" | "price_level" | "place_name" | "category">>) => {
      if (!trip) return;
      const updated = { ...entry, ...patch };
      const next = entries.map((e) => (e.id === entry.id ? updated : e));
      setEntries(next);
      saveEntries(trip.id, next);
      setOpenEntry(updated);
    },
    [trip, entries],
  );

  const deleteComment = useCallback((entry: JournalEntry, commentId: string) => {
    if (!trip) return;
    const updatedEntry = { ...entry, comments: entry.comments.filter((c) => c.id !== commentId) };
    const next = entries.map((e) => (e.id === entry.id ? updatedEntry : e));
    setEntries(next);
    saveEntries(trip.id, next);
    setOpenEntry(updatedEntry);
    if (mode === "online" && client && userId) {
      deleteCommentRemote({ client, tripId: trip.id, userId }, commentId);
    }
  }, [trip, entries, mode, client, userId]);

  const deleteEntry = useCallback(async (e: JournalEntry) => {
    if (!trip) return;
    if (!confirm("¿Eliminar esta publicación?")) return;
    await deleteVaultBlob(e.id).catch(() => {});
    const next = entries.filter((x) => x.id !== e.id);
    setEntries(next);
    saveEntries(trip.id, next);
    setOpenEntry(null);
    toast("Publicación eliminada", "info");
  }, [trip, entries]);

  if (!trip) {
    return (
      <div className="animate-fade-in">
        <LargeTitle title="Diario" serif />
        <div className="mt-8"><EmptyState title="Sin viaje activo" icon={<BookOpen className="w-8 h-8" />} action={<Link href="/trips"><Button variant="default">Crear o elegir viaje</Button></Link>} /></div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-20" role="region" aria-label="Diario de viaje">
      <LargeTitle
        eyebrow={`${entries.length} ${entries.length === 1 ? "publicación" : "publicaciones"}${stats.places > 0 ? ` · ${stats.places} ${stats.places === 1 ? "lugar" : "lugares"}` : ""}`}
        title="Diario"
        serif
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPrintOpen(true)}
            className="gap-1.5"
            aria-label="Pedir libro físico del viaje"
          >
            <BookOpen className="w-4 h-4" />
            Pedir libro
          </Button>
        }
      />

      {/* ─── Filter tabs ─── */}
      <section className="px-4 mb-4">
        <div className="ios-card p-1 grid grid-cols-3 gap-1">
          <FilterTab
            active={filter === "all"}
            onClick={() => setFilter("all")}
            label="Todo"
            count={entries.length}
          />
          <FilterTab
            active={filter === "trip"}
            onClick={() => setFilter("trip")}
            label="Viaje"
            icon={<Plane className="w-3.5 h-3.5" />}
            count={stats.trip}
          />
          <FilterTab
            active={filter === "food"}
            onClick={() => setFilter("food")}
            label={t.journal.foodie}
            icon={<Utensils className="w-3.5 h-3.5" />}
            count={stats.food}
          />
        </div>
      </section>

      {/* ─── Add CTAs — dos botones explícitos por categoría ─── */}
      <section className="px-4 mb-6 grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            setNewCategory("trip");
            if (nativeAvail) handleCamera("trip");
            else fileInputRef.current?.click();
          }}
          className="pressable tampu-icon tampu-icon-indigo h-14 rounded-2xl flex items-center justify-center gap-2 font-semibold text-[14px]"
        >
          <Plane className="w-4 h-4" strokeWidth={2.2} />
          Foto del viaje
        </button>
        <button
          onClick={() => {
            setNewCategory("food");
            if (nativeAvail) handleCamera("food");
            else fileInputRef.current?.click();
          }}
          className="pressable tampu-icon tampu-icon-canela h-14 rounded-2xl flex items-center justify-center gap-2 font-semibold text-[14px]"
        >
          <Utensils className="w-4 h-4" strokeWidth={2.2} />
          {t.journal.foodie}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0] || null, newCategory);
            e.target.value = "";
          }}
        />
      </section>

      {/* ─── Feed ─── */}
      {filtered.length === 0 ? (
        <div className="px-4 space-y-3">
          <EmptyState
            title={filter === "food" ? `Sin ${t.journal.foodie} todavía` : filter === "trip" ? "Sin fotos del viaje" : "Sin publicaciones todavía"}
            description="Capturá momentos del viaje. Las fotos quedan offline en tu dispositivo, con ubicación y categoría."
            icon={filter === "food" ? <Utensils className="w-8 h-8" /> : <Camera className="w-8 h-8" />}
          />
          {entries.length === 0 && <HintCard hintId="journal-first-photo" delay={150} />}
        </div>
      ) : (
        <div className="space-y-4 px-4">
          {visible.map((e, idx) => (
            <div key={e.id} className={idx < 4 ? "" : "cv-auto-sm"}>
              <FeedCard
                entry={e}
                thumb={thumbs[e.id]}
                onOpen={() => setOpenEntry(e)}
                onLike={() => toggleLike(e)}
                formatDate={formatDate}
              />
            </div>
          ))}
          {hasMore && (
            <button
              onClick={() => setVisibleCount(c => c + 15)}
              className="pressable w-full h-12 rounded-2xl border-2 border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors text-[13px] font-semibold"
              aria-label={`Cargar más publicaciones · ${filtered.length - visibleCount} restantes`}
            >
              Cargar 15 más · quedan {filtered.length - visibleCount}
            </button>
          )}
        </div>
      )}

      {/* ─── Detail Sheet con likes + comments ─── */}
      <Sheet
        open={!!openEntry}
        onClose={() => { setOpenEntry(null); setCommentDraft(""); }}
        title={openEntry ? formatDate(new Date(openEntry.ts).toISOString().slice(0, 10), "long") : ""}
      >
        {openEntry && (
          <div className="space-y-4 pb-4">
            {/* Image */}
            {thumbs[openEntry.id] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbs[openEntry.id]}
                alt={openEntry.caption || "Publicación"}
                className="w-full max-h-[55vh] object-contain rounded-xl bg-black"
              />
            )}

            {/* Category selector (Viaje · Comida · Atracción · Alojamiento) */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(["trip", "food", "attraction", "stay"] as EntryCategory[]).map((cat) => {
                const active = openEntry.category === cat;
                const label = cat === "trip" ? t.journal.trip : cat === "food" ? t.journal.foodie : cat === "attraction" ? t.journal.attraction : t.journal.stay;
                return (
                  <button
                    key={cat}
                    onClick={() => updateReview(openEntry, { category: cat })}
                    className={`pressable px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                      active ? "tampu-block-terracota text-white" : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Location chip (auto desde GPS) */}
            {openEntry.place && (
              <a
                href={
                  openEntry.lat && openEntry.lon
                    ? `https://www.openstreetmap.org/?mlat=${openEntry.lat}&mlon=${openEntry.lon}#map=15/${openEntry.lat}/${openEntry.lon}`
                    : `https://www.openstreetmap.org/search?query=${encodeURIComponent(openEntry.place)}`
                }
                target="_blank"
                rel="noreferrer"
                className="pressable inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted text-[11px] font-semibold text-primary"
              >
                <MapPin className="w-3 h-3" />
                {openEntry.place}
              </a>
            )}

            {/* Review block — solo aparece si category es food / attraction / stay */}
            {openEntry.category !== "trip" && (
              <div className="ios-card p-4 space-y-3">
                <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-muted-foreground">Tu reseña</p>

                {/* Nombre del lugar */}
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground tracking-wider">
                    {openEntry.category === "food" ? "Restaurante" : openEntry.category === "attraction" ? "Atracción" : "Alojamiento"}
                  </label>
                  <Input
                    value={openEntry.place_name || ""}
                    onChange={(e) => updateReview(openEntry, { place_name: e.target.value })}
                    placeholder={openEntry.category === "food" ? "Ej. Don Julio" : "Nombre del lugar"}
                    className="mt-1"
                  />
                </div>

                {/* Estrellas 1-5 */}
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Tu rating</label>
                  <div className="flex items-center gap-1 mt-1.5">
                    {[1, 2, 3, 4, 5].map((s) => {
                      const filled = (openEntry.rating ?? 0) >= s;
                      return (
                        <button
                          key={s}
                          onClick={() => updateReview(openEntry, { rating: s })}
                          className="pressable p-1"
                          aria-label={`${s} estrella${s === 1 ? "" : "s"}`}
                        >
                          <span className={`text-[22px] leading-none ${filled ? "text-warning" : "text-muted-foreground/35"}`}>★</span>
                        </button>
                      );
                    })}
                    {openEntry.rating && (
                      <button
                        onClick={() => updateReview(openEntry, { rating: undefined })}
                        className="pressable text-[11px] text-muted-foreground ml-2"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>
                </div>

                {/* Price level $ - $$$$ — solo para food */}
                {openEntry.category === "food" && (
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Precio típico cubierto</label>
                    <div className="flex items-center gap-2 mt-1.5">
                      {[1, 2, 3, 4].map((p) => {
                        const active = openEntry.price_level === p;
                        return (
                          <button
                            key={p}
                            onClick={() => updateReview(openEntry, { price_level: p as 1 | 2 | 3 | 4 })}
                            className={`pressable px-3 py-1.5 rounded-lg text-[14px] font-bold transition-colors ${
                              active ? "tampu-block-cardon text-white" : "bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                            aria-label={`${p} pesos`}
                          >
                            {"$".repeat(p)}
                          </button>
                        );
                      })}
                      {openEntry.price_level && (
                        <button
                          onClick={() => updateReview(openEntry, { price_level: undefined })}
                          className="pressable text-[11px] text-muted-foreground"
                        >
                          Limpiar
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Like + counts row */}
            <div className="flex items-center gap-4 pt-1">
              <button
                onClick={() => toggleLike(openEntry)}
                className="pressable inline-flex items-center gap-2 text-[14px] font-semibold"
                aria-pressed={openEntry.liked}
                aria-label={openEntry.liked ? "Quitar me gusta" : "Marcar me gusta"}
              >
                <Heart
                  className={`w-5 h-5 transition-all ${openEntry.liked ? "fill-destructive text-destructive scale-110 heart-pop" : "text-muted-foreground"}`}
                  strokeWidth={2.2}
                />
                <span className={openEntry.liked ? "text-destructive" : "text-muted-foreground"}>
                  {openEntry.liked ? "Te gusta" : "Me gusta"}
                </span>
              </button>
              <span className="text-[13px] text-muted-foreground inline-flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" aria-hidden />
                {openEntry.comments.length} {openEntry.comments.length === 1 ? "comentario" : "comentarios"}
              </span>
            </div>

            {/* Caption editable */}
            <div>
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Pie de foto</label>
              <Textarea
                value={openEntry.caption}
                onChange={(e) => onCaptionChange(openEntry, e.target.value)}
                placeholder={openEntry.category === "food" ? "¿Qué comiste? ¿Dónde? ¿Cuánto?" : "¿Qué pasó en este momento?"}
                rows={2}
                className="mt-1"
              />
            </div>

            {/* Comments */}
            <div>
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2">
                Comentarios
              </p>
              {openEntry.comments.length > 0 ? (
                <div className="space-y-2 mb-2">
                  {openEntry.comments.map((c) => (
                    <div key={c.id} className="ios-card p-3 group">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[12px] font-semibold">{c.author}</p>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(c.ts).toLocaleString("es-AR", {
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </div>
                      <p className="text-[13px] leading-snug mt-1">{c.body}</p>
                      <button
                        onClick={() => deleteComment(openEntry, c.id)}
                        className="opacity-0 group-hover:opacity-100 mt-1.5 text-[11px] text-muted-foreground hover:text-destructive transition-opacity"
                        aria-label="Eliminar comentario"
                      >
                        Eliminar
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground italic mb-2">Sin comentarios todavía.</p>
              )}

              <div className="flex items-end gap-2">
                <Input
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  placeholder={openEntry.category === "food" ? "Volvería · estaba rico · caro pero vale" : "Tu nota sobre este momento"}
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && commentDraft.trim()) {
                      e.preventDefault();
                      addComment(openEntry, commentDraft);
                    }
                  }}
                  aria-label="Escribir un comentario"
                />
                <Button
                  onClick={() => addComment(openEntry, commentDraft)}
                  disabled={!commentDraft.trim()}
                  size="sm"
                  className="h-10 px-3"
                  aria-label="Publicar comentario"
                >
                  <Send className="w-4 h-4" aria-hidden />
                </Button>
              </div>
            </div>

            {/* Delete action */}
            <div className="pt-2 border-t border-border/40">
              <Button
                onClick={() => deleteEntry(openEntry)}
                variant="destructive"
                size="sm"
                className="w-full gap-1"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar publicación
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      {/* Print book sheet — wire to /api/print-book */}
      <PrintBookSheet
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        tripId={trip.id}
        tripName={trip.name}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function FilterTab({
  active,
  onClick,
  label,
  icon,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`pressable h-9 rounded-xl text-[12.5px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${
        active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
      <span className={`text-[10px] px-1.5 rounded-full ${active ? "bg-white/20" : "bg-muted"}`}>
        {count}
      </span>
    </button>
  );
}

function FeedCard({
  entry,
  thumb,
  onOpen,
  onLike,
  formatDate,
}: {
  entry: JournalEntry;
  thumb?: string;
  onOpen: () => void;
  onLike: () => void;
  formatDate: (d: string, s?: "short" | "long" | "iso") => string;
}) {
  const { t } = useI18n();
  const date = formatDate(new Date(entry.ts).toISOString().slice(0, 10), "long");
  const time = new Date(entry.ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

  return (
    <article className="ios-card overflow-hidden">
      {/* Header: category + date + place */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                entry.category === "food" ? "tampu-icon tampu-icon-canela" : "tampu-icon tampu-icon-indigo"
              }`}
            >
              {entry.category === "food" ? <Utensils className="w-4 h-4" /> : <Plane className="w-4 h-4" />}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold leading-tight truncate">
                {entry.place || (entry.category === "food" ? t.journal.foodie : t.journal.photoMoment)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {date} · {time}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Image (tap → opens detail) */}
      <button
        onClick={onOpen}
        className="block w-full bg-muted overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ring-inset"
        aria-label={`Abrir publicación: ${entry.caption || entry.place || "sin título"}`}
      >
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={entry.caption || "Foto del diario"} className="w-full aspect-[4/5] object-cover" />
        ) : (
          <div className="w-full aspect-[4/5] flex items-center justify-center text-muted-foreground">
            <Camera className="w-10 h-10" />
          </div>
        )}
      </button>

      {/* Actions row: like + comment count */}
      <div className="px-4 py-2.5 flex items-center gap-4">
        <button
          onClick={onLike}
          className="pressable inline-flex items-center gap-1.5"
          aria-pressed={entry.liked}
          aria-label={entry.liked ? "Quitar me gusta" : "Marcar me gusta"}
        >
          <Heart
            className={`w-6 h-6 transition-all ${entry.liked ? "fill-destructive text-destructive scale-110 heart-pop" : "text-foreground"}`}
            strokeWidth={2.0}
          />
        </button>
        <button
          onClick={onOpen}
          className="pressable inline-flex items-center gap-1.5 text-muted-foreground"
          aria-label="Ver comentarios"
        >
          <MessageCircle className="w-6 h-6" strokeWidth={2.0} aria-hidden />
        </button>
      </div>

      {/* Caption + counts */}
      {(entry.caption || entry.liked || entry.comments.length > 0) && (
        <div className="px-4 pb-3">
          {(entry.liked || entry.comments.length > 0) && (
            <p className="text-[12px] text-muted-foreground mb-1">
              {entry.liked && "1 me gusta"}
              {entry.liked && entry.comments.length > 0 && " · "}
              {entry.comments.length > 0 && `${entry.comments.length} ${entry.comments.length === 1 ? "comentario" : "comentarios"}`}
            </p>
          )}
          {entry.caption && (
            <p className="text-[13px] leading-snug line-clamp-3">{entry.caption}</p>
          )}
        </div>
      )}
    </article>
  );
}
