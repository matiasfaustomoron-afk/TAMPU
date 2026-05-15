"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, UserPlus, Check, X, Loader2, Mail, Shield, Eye } from "lucide-react";
import { LargeTitle, Sheet } from "@/components/ios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { toast } from "@/components/ios/toast";
import { useActiveTrip, useTripMembers } from "@/lib/hooks/use-trip-data";
import { useTripRealtime } from "@/lib/hooks/use-trip-realtime";
import { useSupabase } from "@/lib/context/supabase-provider";
import { setActiveTrip } from "@/lib/data/trips";
import {
  fetchPendingInvites,
  revokeMember,
  removeMember as removeMemberData,
} from "@/lib/data/members";
import { track, EVENTS } from "@/lib/analytics";

/**
 * /share — gestión de miembros del viaje activo.
 *
 * - Lista miembros activos del trip (owner + editors + viewers).
 * - Lista invitaciones pendientes (mandadas por el owner, todavía sin aceptar).
 * - Owner puede invitar a nuevos emails con rol editor o viewer.
 * - Cualquier miembro autenticado puede aceptar/rechazar invitaciones que matcheen su email.
 *
 * Si el modo de datos es demo (sin Supabase auth), mostramos un empty state
 * explicando que compartir requiere registro.
 */

interface Member {
  id: string;
  trip_id: string;
  user_id: string | null;
  invited_email: string | null;
  role: "owner" | "editor" | "viewer";
  status: "pending" | "active" | "revoked";
  invited_at: string;
  accepted_at: string | null;
}

interface PendingInvite extends Member {
  trip?: { name?: string; destination?: string };
}

const ROLE_LABEL: Record<Member["role"], string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Visualización",
};
const ROLE_TONE: Record<Member["role"], string> = {
  owner: "tampu-icon tampu-icon-terracota",
  editor: "tampu-icon tampu-icon-cardon",
  viewer: "tampu-icon tampu-icon-piedra",
};

function SharePageContent() {
  const { data: trip } = useActiveTrip();
  const { client, mode } = useSupabase();
  const router = useRouter();
  // Members list: TanStack-managed. `useTripMembers` returns the native
  // TanStack shape (data/isLoading/refetch). The legacy `Member[]` setState
  // path queda eliminado — invalidaciones via mutations + realtime mantienen
  // el cache fresco.
  const { data: members = [], isLoading: membersLoading, refetch: refetchMembers } = useTripMembers(trip?.id);
  // pendingForMe sigue siendo local porque la query es por email (no por
  // tripId), no cabe en `useTripMembers`. Lo migramos al data layer
  // (`fetchPendingInvites`) para que toda la lógica SQL viva en /lib/data.
  const [pendingForMe, setPendingForMe] = useState<PendingInvite[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [inviting, setInviting] = useState(false);
  const [me, setMe] = useState<{ id: string; email: string | null } | null>(null);
  // Deep-link via ?invite=<member_id>: scroll a la fila + highlight ring
  // hasta que el user interactúa. Construido para los links de email inbound.
  const searchParams = useSearchParams();
  const inviteParam = searchParams.get("invite");
  const memberRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Detect current user
  useEffect(() => {
    if (!client) return;
    client.auth.getUser().then(({ data }) => {
      if (data.user) setMe({ id: data.user.id, email: data.user.email ?? null });
    });
  }, [client]);

  // Pending invites para MI email: refetch dedicado (no es scoped a un trip).
  const refetchPending = useCallback(async () => {
    if (!client || !me?.email) {
      setPendingForMe([]);
      setPendingLoading(false);
      return;
    }
    setPendingLoading(true);
    try {
      const data = await fetchPendingInvites(client, me.email);
      setPendingForMe((data as PendingInvite[]) || []);
    } catch (err) {
      console.error("[share] pending invites fetch failed:", err);
    } finally {
      setPendingLoading(false);
    }
  }, [client, me?.email]);

  useEffect(() => {
    refetchPending();
  }, [refetchPending]);

  // Refetch unificado para los call sites (sendInvite/acceptInvite/etc.) —
  // dispara ambas queries en paralelo, manteniendo el contrato anterior.
  const refetch = useCallback(async () => {
    await Promise.all([refetchMembers(), refetchPending()]);
  }, [refetchMembers, refetchPending]);

  // Auto-refresh cuando otro miembro acepta/se une: realtime dispara
  // refetchMembers, que invalida la query y trae el nuevo estado.
  useTripRealtime(trip?.id, { tripMembers: () => { void refetchMembers(); } });

  const loading = membersLoading || pendingLoading;

  // Cuando la lista llega y el query param `invite` está, hacemos scroll a la
  // fila del miembro y la resaltamos con un ring. Solo dispara una vez por
  // navigation (limpiamos highlight si el user clickea fuera).
  useEffect(() => {
    if (!inviteParam) return;
    if (members.length === 0) return;
    const target = members.find((m) => m.id === inviteParam);
    if (!target) return;
    const el = memberRefs.current[target.id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(target.id);
    const t = window.setTimeout(() => setHighlightedId(null), 4000);
    return () => window.clearTimeout(t);
  }, [inviteParam, members]);

  const isOwner = !!members.find(
    (m) => m.user_id === me?.id && m.role === "owner" && m.status === "active",
  );

  const sendInvite = useCallback(async () => {
    if (!trip || !email.trim()) return;
    setInviting(true);
    try {
      const res = await fetch("/api/trip-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: trip.id, email: email.trim(), role }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast(json.error || "No se pudo enviar la invitación", "error");
      } else {
        toast(`Invitación enviada a ${email}`, "success");
        track(EVENTS.TRIP_INVITED, { role });
        setEmail("");
        setInviteOpen(false);
        refetch();
      }
    } catch (err) {
      console.error(err);
      toast("Error de red al invitar", "error");
    } finally {
      setInviting(false);
    }
  }, [trip, email, role, refetch]);

  const acceptInvite = useCallback(
    async (id: string) => {
      try {
        const res = await fetch("/api/trip-invite", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invitation_id: id }),
        });
        const json = await res.json();
        if (!res.ok) {
          toast(json.error || "No se pudo aceptar", "error");
        } else {
          toast("Aceptaste la invitación", "success");
          track(EVENTS.TRIP_INVITE_ACCEPTED);
          await refetch();
          // Activar el trip recién aceptado y mandar al user al "today" del
          // viaje. La RPC set_active_trip valida ownership server-side; si
          // falla, dejamos al user en /members con un toast suave.
          const acceptedTripId: string | undefined = json?.membership?.trip_id ?? json?.trip_id;
          if (acceptedTripId && client) {
            try {
              await setActiveTrip(client, acceptedTripId);
              router.push("/today");
            } catch (err) {
              console.warn("[members] setActiveTrip after accept failed:", err);
            }
          }
        }
      } catch {
        toast("Error de red", "error");
      }
    },
    [refetch, client, router],
  );

  const declineInvite = useCallback(
    async (id: string) => {
      if (!client) return;
      try {
        await revokeMember(client, id);
        toast("Invitación descartada", "info");
        refetch();
      } catch {
        toast("Error", "error");
      }
    },
    [client, refetch],
  );

  const removeMember = useCallback(
    async (id: string) => {
      if (!client) return;
      if (!confirm("¿Quitar a este miembro del viaje?")) return;
      try {
        await removeMemberData(client, id);
        toast("Miembro removido", "info");
        refetch();
      } catch {
        toast("No se pudo remover", "error");
      }
    },
    [client, refetch],
  );

  // Demo mode — no auth
  if (mode === "demo") {
    return (
      <div className="animate-fade-in pb-24">
        <LargeTitle eyebrow="Viaje" title="Compartir" serif />
        <section className="px-4 mt-6">
          <div className="ios-card p-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl tampu-icon tampu-icon-piedra flex items-center justify-center mb-4">
              <Users className="w-6 h-6" />
            </div>
            <h2 className="font-serif text-2xl">Compartir requiere cuenta</h2>
            <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed max-w-sm mx-auto">
              Estás en modo demo. Para compartir tu viaje con compañeros de
              ruta tenés que registrarte. Tus datos demos se mantienen al pasar.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-24">
      <LargeTitle
        eyebrow="Viaje"
        title="Compartir"
        serif
        action={
          isOwner && (
            <Button
              onClick={() => setInviteOpen(true)}
              className="tampu-gradient-warm text-white gap-1"
            >
              <UserPlus className="w-4 h-4" />
              Invitar
            </Button>
          )
        }
      />

      {loading && (
        <p className="px-5 text-[13px] text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin inline mr-2" />
          Cargando miembros…
        </p>
      )}

      {/* Pending invites FOR ME */}
      {pendingForMe.length > 0 && (
        <section className="px-4 mt-2 mb-6">
          <p className="ios-eyebrow">Invitaciones pendientes</p>
          <div className="space-y-2">
            {pendingForMe.map((inv) => (
              <div key={inv.id} className="ios-card p-4">
                <div className="flex items-start gap-3">
                  <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 tampu-icon tampu-icon-mostaza">
                    <Mail className="w-5 h-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted-foreground">
                      Te invitaron como {ROLE_LABEL[inv.role]}
                    </p>
                    <p className="text-[15px] font-semibold leading-tight mt-1 truncate">
                      {inv.trip?.name || inv.trip?.destination || "Un viaje"}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <Button variant="outline" onClick={() => declineInvite(inv.id)} className="gap-1">
                    <X className="w-4 h-4" />
                    Rechazar
                  </Button>
                  <Button onClick={() => acceptInvite(inv.id)} className="tampu-gradient-warm text-white gap-1">
                    <Check className="w-4 h-4" />
                    Aceptar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Members of current trip */}
      {trip && (
        <section className="px-4 mt-2">
          <p className="ios-eyebrow">Miembros de {trip.name}</p>
          {members.length === 0 && !loading && (
            <div className="ios-card p-6 text-center">
              <p className="text-[13px] text-muted-foreground">Todavía no hay miembros.</p>
            </div>
          )}
          <div className="space-y-2">
            {members.map((m) => {
              const isMe = m.user_id === me?.id;
              const RoleIcon = m.role === "viewer" ? Eye : m.role === "owner" ? Shield : UserPlus;
              const isHighlighted = highlightedId === m.id;
              return (
                <div
                  key={m.id}
                  ref={(el) => { memberRefs.current[m.id] = el; }}
                  className={`ios-card p-4 transition-shadow ${isHighlighted ? "ring-2 ring-primary" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${ROLE_TONE[m.role]}`}>
                      <RoleIcon className="w-5 h-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted-foreground">
                          {ROLE_LABEL[m.role]} {m.status === "pending" ? "· pendiente" : ""}
                        </p>
                        {isMe && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-primary/15 text-primary">
                            vos
                          </span>
                        )}
                      </div>
                      <p className="text-[15px] font-semibold leading-tight mt-1 truncate">
                        {m.invited_email || (isMe ? me?.email : "Miembro registrado")}
                      </p>
                    </div>
                    {isOwner && m.role !== "owner" && (
                      <button
                        onClick={() => removeMember(m.id)}
                        className="text-[12px] font-semibold text-destructive shrink-0 px-2 py-1 rounded-md hover:bg-destructive/10 pressable"
                        aria-label="Remover miembro"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {!isOwner && (
            <p className="text-[11px] text-muted-foreground mt-3 px-1 leading-relaxed">
              Solo el owner del viaje puede invitar nuevos miembros.
            </p>
          )}
        </section>
      )}

      {/* Invite sheet */}
      <Sheet open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invitar a un viajero">
        <div className="space-y-3 pb-4">
          <div>
            <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Email</label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="amigo@gmail.com"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Rol</label>
            <SelectNative
              value={role}
              onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
              className="mt-1"
            >
              <option value="editor">Editor — puede agregar reservas y gastos</option>
              <option value="viewer">Visualización — solo lectura</option>
            </SelectNative>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Le mandamos un email con el link para aceptar. Aparece como pendiente acá hasta que confirme.
          </p>
          <Button
            onClick={sendInvite}
            disabled={!email.trim() || inviting}
            className="w-full tampu-gradient-warm text-white"
          >
            {inviting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Enviando…
              </>
            ) : (
              "Enviar invitación"
            )}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={null}>
      <SharePageContent />
    </Suspense>
  );
}
