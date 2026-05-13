"use client";

import type { Task, Reservation } from "@/lib/types/database";
import { scheduleReminder, cancelReminder, isNative, getPref, setPref } from "@/lib/native/platform";

// ─── Task & Reservation reminders ───
// Programa notificaciones locales nativas (APNs/FCM no requeridos — usamos Capacitor
// LocalNotifications, que dispara desde el OS aunque la app esté cerrada).
//
// Reglas:
//   - Notif 1: el día anterior al deadline a las 9am ("Mañana vence: X")
//   - Notif 2: el día del deadline a las 9am ("Hoy vence: X")
//   - Idempotente: cancela los reminders previos y reprograma cada vez que se llama.
//   - No-op en web (LocalNotifications no existe en navegador estándar — usaríamos
//     WebPush vía SW, pero requiere VAPID keys + backend; queda fuera del MVP).

const ENABLED_KEY = "tampu-task-reminders-enabled";
const SCHEDULED_IDS_KEY = "tampu-task-reminders-ids";

export async function areTaskRemindersEnabled(): Promise<boolean> {
  return (await getPref(ENABLED_KEY)) === "true";
}

export async function setTaskRemindersEnabled(on: boolean): Promise<void> {
  await setPref(ENABLED_KEY, on ? "true" : "false");
  if (!on) await cancelAllTaskReminders();
}

// Hash determinístico para mapear task.id (string) → notification.id (int32 positivo).
function idHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (Math.abs(h) % 2_000_000_000) + 1;
}

interface PendingItem {
  id: string;
  title: string;
  due: Date;
  kind: "task" | "reservation";
  /** Si es vuelo (task.category === "flights" o reservation.type === "flight").
   *  Cuando true: reminder del día del deadline pasa de 9am a "6h antes" + se
   *  agrega un reminder "30min antes" — los vuelos tienen hora exacta, no
   *  tiene sentido el wakeup genérico de las 9am. */
  isFlight?: boolean;
  /** True si el due_date tiene componente horario real (HH:mm distinto de 00:00).
   *  Si solo trae fecha, fallback al 9am rule para vuelos. */
  hasTime?: boolean;
}

async function loadScheduledIds(): Promise<number[]> {
  const raw = (await getPref(SCHEDULED_IDS_KEY)) || "[]";
  try { return JSON.parse(raw) as number[]; } catch { return []; }
}

async function saveScheduledIds(ids: number[]): Promise<void> {
  await setPref(SCHEDULED_IDS_KEY, JSON.stringify(ids));
}

export async function cancelAllTaskReminders(): Promise<void> {
  const ids = await loadScheduledIds();
  for (const id of ids) {
    try { await cancelReminder(id); } catch { /* ignore */ }
  }
  await saveScheduledIds([]);
}

/**
 * Convierte tasks + reservations en PendingItems con due_date futuro.
 * Excluye tasks done/cancelled y reservas cancelled/expired.
 */
/** Detecta si el ISO string trae componente horario real (HH:mm != 00:00). */
function hasRealTimeComponent(iso: string): boolean {
  // ISO con T tiene la hora; sin T es solo date
  if (!iso.includes("T")) return false;
  try {
    const d = new Date(iso);
    return d.getHours() !== 0 || d.getMinutes() !== 0;
  } catch { return false; }
}

export function collectPendingItems(tasks: Task[], reservations: Reservation[]): PendingItem[] {
  const out: PendingItem[] = [];

  for (const t of tasks) {
    if (t.status === "done" || t.status === "cancelled") continue;
    if (!t.due_date) continue;
    const due = new Date(t.due_date);
    if (isNaN(due.getTime())) continue;
    out.push({
      id: t.id,
      title: t.title,
      due,
      kind: "task",
      isFlight: t.category === "flights",
      hasTime: hasRealTimeComponent(t.due_date),
    });
  }

  for (const r of reservations) {
    if (r.status === "cancelled" || r.status === "expired") continue;
    const deadline = r.payment_deadline || r.use_date;
    if (!deadline) continue;
    const due = new Date(deadline);
    if (isNaN(due.getTime())) continue;
    out.push({
      id: r.id,
      title: r.description.substring(0, 80),
      due,
      kind: "reservation",
      isFlight: r.type === "flight",
      hasTime: hasRealTimeComponent(deadline),
    });
  }

  return out;
}

/**
 * Programa reminders nativos para items pendientes.
 * Retorna { scheduled, skipped } para diagnóstico.
 */
export async function syncTaskReminders(items: PendingItem[]): Promise<{ scheduled: number; skipped: number }> {
  if (!(await isNative())) return { scheduled: 0, skipped: items.length };
  if (!(await areTaskRemindersEnabled())) return { scheduled: 0, skipped: items.length };

  await cancelAllTaskReminders();

  const newIds: number[] = [];
  const now = Date.now();

  for (const item of items) {
    if (item.due.getTime() <= now) continue;

    // Día antes a las 9am (preparación) — para TODOS los items, incluido flights
    const oneDayBefore = new Date(item.due);
    oneDayBefore.setDate(oneDayBefore.getDate() - 1);
    oneDayBefore.setHours(9, 0, 0, 0);
    if (oneDayBefore.getTime() > now) {
      const nid = idHash(`${item.id}:1d`);
      const ok = await scheduleReminder({
        id: nid,
        title: item.isFlight ? "Vuelo mañana" : "Pendiente mañana",
        body: item.title,
        fireAt: oneDayBefore,
      });
      if (ok) newIds.push(nid);
    }

    // Smart timing para vuelos: usar la hora real del due_date si está disponible
    if (item.isFlight && item.hasTime) {
      // Notif 1: 6h antes del vuelo
      const sixHoursBefore = new Date(item.due.getTime() - 6 * 60 * 60 * 1000);
      if (sixHoursBefore.getTime() > now) {
        const nid = idHash(`${item.id}:6h`);
        const ok = await scheduleReminder({
          id: nid,
          title: "Vuelo en 6h",
          body: item.title,
          fireAt: sixHoursBefore,
        });
        if (ok) newIds.push(nid);
      }
      // Notif 2: 30min antes — momento del gate
      const thirtyMinBefore = new Date(item.due.getTime() - 30 * 60 * 1000);
      if (thirtyMinBefore.getTime() > now) {
        const nid = idHash(`${item.id}:30m`);
        const ok = await scheduleReminder({
          id: nid,
          title: "Vuelo en 30min",
          body: `${item.title} · confirmá gate`,
          fireAt: thirtyMinBefore,
        });
        if (ok) newIds.push(nid);
      }
    } else {
      // Default rule: día del deadline a las 9am (todo lo que no es flight con hora)
      const sameDay = new Date(item.due);
      sameDay.setHours(9, 0, 0, 0);
      if (sameDay.getTime() > now) {
        const nid = idHash(`${item.id}:d`);
        const ok = await scheduleReminder({
          id: nid,
          title: item.isFlight ? "Vuelo hoy" : "Vence hoy",
          body: item.title,
          fireAt: sameDay,
        });
        if (ok) newIds.push(nid);
      }
    }
  }

  await saveScheduledIds(newIds);
  return { scheduled: newIds.length, skipped: items.length - newIds.length };
}
