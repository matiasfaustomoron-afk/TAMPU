// ─── Polls A vs B vs C con deadline ───
//
// Sistema simple para decidir entre múltiples opciones — útil para grupos:
// "¿Hotel A o B?", "¿Cenamos sushi o asado?", "¿Tour de día o de noche?".
//
// Storage:
//   - Demo / sin supabase → localStorage bajo `tampu.polls.<trip_id>`
//   - Online → tabla `polls` en Supabase (definida en migración 00022)
//
// Cada user vota una vez por poll (un map { userId → optionId } guardado en
// el poll mismo). Cambiar voto sobreescribe. Hay deadline ISO; despues no
// se pueden agregar votos (la UI hide el botón pero esto no es lo bastante
// fuerte: el server debería rechazar inserts despues del deadline — TODO).

import type { ActivityEventKind } from "@/lib/collab/activity-feed";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PollOption {
  id: string;          // estable, "A" / "B" / nanoid
  label: string;
  /** Detalle opcional: link al hotel, descripción del plan, etc */
  description?: string;
}

export interface Poll {
  id: string;
  trip_id: string;
  question: string;
  options: PollOption[];
  /** ISO datetime. null = no deadline. */
  deadline: string | null;
  /** Map userId → optionId. */
  votes: Record<string, string>;
  /** Display name de cada voter, para mostrar "Votó: María, Juan" sin needing un join. */
  voter_names: Record<string, string>;
  created_by: string;        // userId
  created_by_name: string;
  created_at: string;
  closed: boolean;           // si el creator decidió cerrar manualmente
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `pol_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── localStorage helpers ───────────────────────────────────────────────────

const LS_PREFIX = "tampu.polls.";

function lsKey(tripId: string): string {
  return `${LS_PREFIX}${tripId}`;
}

export function getLocalPolls(tripId: string): Poll[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(lsKey(tripId));
    if (!raw) return [];
    return JSON.parse(raw) as Poll[];
  } catch { return []; }
}

function saveLocalPolls(tripId: string, polls: Poll[]): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.setItem(lsKey(tripId), JSON.stringify(polls)); }
  catch { /* quota */ }
}

export function createLocalPoll(input: {
  tripId: string;
  question: string;
  options: Array<{ label: string; description?: string }>;
  deadline: string | null;
  userId: string;
  displayName: string;
}): Poll {
  const poll: Poll = {
    id: newId(),
    trip_id: input.tripId,
    question: input.question,
    options: input.options.map((o, i) => ({
      id: String.fromCharCode(65 + i),  // "A", "B", "C", ...
      label: o.label,
      description: o.description,
    })),
    deadline: input.deadline,
    votes: {},
    voter_names: {},
    created_by: input.userId,
    created_by_name: input.displayName,
    created_at: new Date().toISOString(),
    closed: false,
  };
  const cur = getLocalPolls(input.tripId);
  cur.unshift(poll);
  saveLocalPolls(input.tripId, cur);
  return poll;
}

export function voteLocalPoll(tripId: string, pollId: string, userId: string, displayName: string, optionId: string): Poll | null {
  const cur = getLocalPolls(tripId);
  const idx = cur.findIndex(p => p.id === pollId);
  if (idx === -1) return null;
  const poll = cur[idx];
  if (isPollClosed(poll)) return poll;
  poll.votes = { ...poll.votes, [userId]: optionId };
  poll.voter_names = { ...poll.voter_names, [userId]: displayName };
  cur[idx] = poll;
  saveLocalPolls(tripId, cur);
  return poll;
}

export function deleteLocalPoll(tripId: string, pollId: string): void {
  const cur = getLocalPolls(tripId).filter(p => p.id !== pollId);
  saveLocalPolls(tripId, cur);
}

// ─── Helpers de domain ──────────────────────────────────────────────────────

export function isPollClosed(poll: Poll): boolean {
  if (poll.closed) return true;
  if (!poll.deadline) return false;
  return new Date(poll.deadline).getTime() <= Date.now();
}

export function tallyVotes(poll: Poll): { optionId: string; count: number; percent: number; voters: string[] }[] {
  const total = Object.keys(poll.votes).length;
  return poll.options.map(opt => {
    const voters = Object.entries(poll.votes)
      .filter(([, optId]) => optId === opt.id)
      .map(([userId]) => poll.voter_names[userId] || userId);
    const count = voters.length;
    return {
      optionId: opt.id,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
      voters,
    };
  });
}

/**
 * Devuelve null si el poll todavía está abierto sin un ganador claro.
 * Si está cerrado, devuelve la opción con más votos (en empate, la primera).
 */
export function winningOption(poll: Poll): PollOption | null {
  if (!isPollClosed(poll)) {
    // Si está abierto, devolvemos el "leading" si hay diferencia clara
    const tally = tallyVotes(poll);
    const top = tally.reduce((acc, t) => t.count > acc.count ? t : acc, tally[0]);
    if (top.count === 0) return null;
    return poll.options.find(o => o.id === top.optionId) || null;
  }
  const tally = tallyVotes(poll);
  const top = tally.reduce((acc, t) => t.count > acc.count ? t : acc, tally[0]);
  return poll.options.find(o => o.id === top.optionId) || null;
}

/** Texto humano "cierra en 2h" / "cerró hace 1d" / "sin deadline". */
export function deadlineText(poll: Poll): string {
  if (!poll.deadline) return "sin deadline";
  const diff = new Date(poll.deadline).getTime() - Date.now();
  const abs = Math.abs(diff);
  const m = Math.floor(abs / 60_000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  let text: string;
  if (d > 0) text = `${d}d`;
  else if (h > 0) text = `${h}h`;
  else text = `${Math.max(1, m)}min`;
  return diff > 0 ? `cierra en ${text}` : `cerró hace ${text}`;
}

/** ActivityEvent kind para polls (re-export para keep consumers DRY). */
export const POLL_ACTIVITY_KINDS = ["poll_created", "poll_voted"] as const satisfies readonly ActivityEventKind[];

// ─── Validación de input ───────────────────────────────────────────────────

export interface CreatePollInput {
  tripId: string;
  question: string;
  options: Array<{ label: string; description?: string }>;
  deadline: string | null;
  userId: string;
  displayName: string;
}

export interface PollValidationError {
  field: "question" | "options" | "deadline";
  message: string;
}

/** Validá un input de creación. Devuelve null si OK; sino un error. Spec:
 *  - 2-6 opciones (labels no vacíos)
 *  - question >= 5 chars
 *  - deadline futuro si se setea
 */
export function validateCreateInput(input: CreatePollInput): PollValidationError | null {
  if (input.question.trim().length < 5) {
    return { field: "question", message: "La pregunta tiene que tener al menos 5 caracteres." };
  }
  const cleaned = input.options.filter(o => o.label.trim().length > 0);
  if (cleaned.length < 2) {
    return { field: "options", message: "Necesitás al menos 2 opciones." };
  }
  if (cleaned.length > 6) {
    return { field: "options", message: "Máximo 6 opciones." };
  }
  if (input.deadline) {
    const t = new Date(input.deadline).getTime();
    if (isNaN(t)) return { field: "deadline", message: "Deadline inválido." };
    if (t <= Date.now()) return { field: "deadline", message: "El deadline tiene que ser futuro." };
  }
  return null;
}

// ─── Spec API aliases ──────────────────────────────────────────────────────
// Nombres pedidos por la spec: createPoll / listPolls / getPoll / castVote /
// closePoll. Mapean a la API legacy + agregan validación.

/**
 * Crea un poll validado. Devuelve { poll } o { error }. Si querés tirar al
 * componente UI, el caller chequea `error` primero.
 */
export function createPoll(input: CreatePollInput): { poll: Poll | null; error: PollValidationError | null } {
  const error = validateCreateInput(input);
  if (error) return { poll: null, error };
  return { poll: createLocalPoll(input), error: null };
}

/** Lista todos los polls del trip. opts.status filtra abiertos/cerrados/todos. */
export function listPolls(
  tripId: string,
  opts?: { status?: "open" | "closed" | "all" }
): Poll[] {
  const all = getLocalPolls(tripId);
  const status = opts?.status || "all";
  if (status === "all") return all;
  return all.filter(p => (status === "closed" ? isPollClosed(p) : !isPollClosed(p)));
}

/** Devuelve el poll por id, o null. */
export function getPoll(tripId: string, pollId: string): Poll | null {
  return getLocalPolls(tripId).find(p => p.id === pollId) || null;
}

/**
 * Vota o cambia voto. Spec: no doble-voto del mismo user (sobreescribe).
 * Returns el Poll actualizado o null si no existe.
 */
export function castVote(
  tripId: string, pollId: string, optionId: string,
  user: { id: string; displayName: string }
): Poll | null {
  return voteLocalPoll(tripId, pollId, user.id, user.displayName, optionId);
}

/** Cierra el poll manualmente (created_by puede). */
export function closePoll(tripId: string, pollId: string): Poll | null {
  const all = getLocalPolls(tripId);
  const idx = all.findIndex(p => p.id === pollId);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], closed: true };
  if (typeof localStorage !== "undefined") {
    try { localStorage.setItem(lsKey(tripId), JSON.stringify(all)); }
    catch { /* quota */ }
  }
  return all[idx];
}

// ─── Auto-close por deadline + activity announce ───────────────────────────
//
// QW7: cuando el deadline pasa y el poll sigue con closed=false, cerramos
// y logueamos un evento "poll_closed" en el activity feed con el ganador.
// Se ejecuta al cargar la lista o periódicamente (hook usePollAutoClose).
//
// El cierre es local — la próxima sync con Supabase persiste el flag.

import { logActivity } from "@/lib/collab/activity-feed";

export interface AutoCloseResult {
  closed: number;
  winners: Array<{ pollId: string; question: string; winnerLabel: string | null }>;
}

/**
 * Recorre los polls del trip y cierra los que pasaron deadline.
 * Por cada uno cerrado, dispara logActivity('poll_closed').
 * Idempotente — un poll ya cerrado se ignora.
 */
export function autoClosePollsIfDue(
  tripId: string,
  actor: { userId: string; displayName: string }
): AutoCloseResult {
  const all = getLocalPolls(tripId);
  const now = Date.now();
  const closed: AutoCloseResult["winners"] = [];

  let mutated = false;
  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    if (p.closed) continue;
    if (!p.deadline) continue;
    if (new Date(p.deadline).getTime() > now) continue;

    // Cerrar
    all[i] = { ...p, closed: true };
    mutated = true;

    const winner = winningOption(all[i]);
    closed.push({
      pollId: p.id,
      question: p.question,
      winnerLabel: winner?.label ?? null,
    });

    // Log activity
    try {
      logActivity({
        tripId,
        userId: actor.userId,
        displayName: actor.displayName,
        kind: "poll_closed",
        summary: winner
          ? `cerró encuesta "${p.question}" — ganó: ${winner.label}`
          : `cerró encuesta "${p.question}" — sin votos`,
        href: "/polls",
      });
    } catch { /* activity feed offline; no bloquea el cierre */ }
  }

  if (mutated && typeof localStorage !== "undefined") {
    try { localStorage.setItem(lsKey(tripId), JSON.stringify(all)); }
    catch { /* quota */ }
  }

  return { closed: closed.length, winners: closed };
}

// ─── Supabase optional persistence ─────────────────────────────────────────
//
// Igual que comments: si la tabla `polls` existe, persistimos también ahí.
// Si no (42P01), fallback silencioso a solo localStorage.

interface SupabasePollRow {
  id: string;
  trip_id: string;
  question: string;
  options: PollOption[];
  deadline: string | null;
  votes: Record<string, string>;
  voter_names: Record<string, string>;
  created_by: string;
  created_by_name: string;
  created_at: string;
  closed: boolean;
}

export async function syncPollToSupabase(
  client: SupabaseClient | null,
  poll: Poll
): Promise<SupabasePollRow | null> {
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("polls")
      .upsert(poll as unknown as SupabasePollRow)
      .select()
      .single();
    if (error) {
      if (error.code === "42P01") return null;
      console.warn("[polls] supabase upsert failed", error.code, error.message);
      return null;
    }
    return data as SupabasePollRow | null;
  } catch (err) {
    console.warn("[polls] supabase sync threw", err);
    return null;
  }
}

// ─── Online-mode CRUD (migration 00032) ────────────────────────────────────
//
// Cuando el caller tiene un SupabaseClient (mode === "online"), usa estas
// funciones para leer/escribir contra la tabla `polls`. Mantenemos los
// helpers locales (getLocalPolls, voteLocalPoll, etc.) intactos para el
// demo mode.
//
// Shape de la row en Supabase coincide con el shape Poll del cliente, así
// que el adapter es identidad — excepto por `closed_at` (timestamptz en DB)
// vs `closed` (boolean en el client). Mapeamos en cada dirección.

interface DbPollRow {
  id: string;
  trip_id: string;
  question: string;
  options: PollOption[];
  votes: Record<string, string>;
  voter_names: Record<string, string> | null;
  deadline: string | null;
  closed_at: string | null;
  created_by: string;
  created_at: string;
}

function dbRowToPoll(row: DbPollRow, createdByName?: string): Poll {
  return {
    id: row.id,
    trip_id: row.trip_id,
    question: row.question,
    options: row.options,
    deadline: row.deadline,
    votes: row.votes ?? {},
    voter_names: row.voter_names ?? {},
    created_by: row.created_by,
    created_by_name: createdByName ?? row.created_by.slice(0, 8),
    created_at: row.created_at,
    closed: !!row.closed_at,
  };
}

/**
 * Lista polls del trip desde Supabase. Si la tabla no existe (42P01) o falla,
 * devuelve `null` para que el caller pueda fallback a localStorage.
 */
export async function listPollsOnline(
  client: SupabaseClient,
  tripId: string
): Promise<Poll[] | null> {
  try {
    const { data, error } = await client
      .from("polls")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false });
    if (error) {
      if (error.code === "42P01") return null;
      console.warn("[polls] listPollsOnline failed", error.code, error.message);
      return null;
    }
    return (data as DbPollRow[]).map((r) => dbRowToPoll(r));
  } catch (err) {
    console.warn("[polls] listPollsOnline threw", err);
    return null;
  }
}

/**
 * Crea un poll en Supabase. El creator se rellena server-side vía default
 * `auth.uid()`, pero igual lo pasamos en el insert para consistencia.
 */
export async function createPollOnline(
  client: SupabaseClient,
  input: CreatePollInput
): Promise<Poll | null> {
  const validation = validateCreateInput(input);
  if (validation) return null;
  const options = input.options.map((o, i) => ({
    id: String.fromCharCode(65 + i),
    label: o.label,
    description: o.description,
  }));
  try {
    const { data, error } = await client
      .from("polls")
      .insert({
        trip_id: input.tripId,
        question: input.question,
        options,
        deadline: input.deadline,
        votes: {},
        voter_names: {},
        created_by: input.userId,
      })
      .select()
      .single();
    if (error) {
      console.warn("[polls] createPollOnline failed", error.code, error.message);
      return null;
    }
    return dbRowToPoll(data as DbPollRow, input.displayName);
  } catch (err) {
    console.warn("[polls] createPollOnline threw", err);
    return null;
  }
}

/**
 * Vota o cambia voto en Supabase. Lee → muta map → escribe. Si dos clients
 * votan al mismo tiempo hay un last-write-wins, aceptable para polls.
 */
export async function castVoteOnline(
  client: SupabaseClient,
  pollId: string,
  optionId: string,
  user: { id: string; displayName: string }
): Promise<Poll | null> {
  try {
    // Read current row (necesitamos votes + voter_names para hacer merge).
    const { data: existing, error: readErr } = await client
      .from("polls")
      .select("*")
      .eq("id", pollId)
      .maybeSingle();
    if (readErr || !existing) {
      console.warn("[polls] castVoteOnline read failed", readErr?.message);
      return null;
    }
    const row = existing as DbPollRow;
    const nextVotes = { ...(row.votes ?? {}), [user.id]: optionId };
    const nextVoterNames = { ...(row.voter_names ?? {}), [user.id]: user.displayName };

    const { data: updated, error: updErr } = await client
      .from("polls")
      .update({ votes: nextVotes, voter_names: nextVoterNames })
      .eq("id", pollId)
      .select()
      .single();
    if (updErr) {
      console.warn("[polls] castVoteOnline update failed", updErr.code, updErr.message);
      return null;
    }
    return dbRowToPoll(updated as DbPollRow);
  } catch (err) {
    console.warn("[polls] castVoteOnline threw", err);
    return null;
  }
}

/** Cierra un poll seteando `closed_at = now()`. */
export async function closePollOnline(
  client: SupabaseClient,
  pollId: string
): Promise<Poll | null> {
  try {
    const { data, error } = await client
      .from("polls")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", pollId)
      .select()
      .single();
    if (error) {
      console.warn("[polls] closePollOnline failed", error.code, error.message);
      return null;
    }
    return dbRowToPoll(data as DbPollRow);
  } catch (err) {
    console.warn("[polls] closePollOnline threw", err);
    return null;
  }
}

/** Borra un poll (solo el creator vía RLS). */
export async function deletePollOnline(
  client: SupabaseClient,
  pollId: string
): Promise<boolean> {
  try {
    const { error } = await client.from("polls").delete().eq("id", pollId);
    if (error) {
      console.warn("[polls] deletePollOnline failed", error.code, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[polls] deletePollOnline threw", err);
    return false;
  }
}
