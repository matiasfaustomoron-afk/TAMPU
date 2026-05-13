"use client";

// ─── Daily brief — LocalNotification every morning ───
// Schedules a recurring notification that summarizes today's events from the
// active trip. Idempotent: re-scheduling cancels the previous one.

import { scheduleReminder, cancelReminder, isNative } from "@/lib/native/platform";

const ID_BASE = 88_000_000; // arbitrary id range for our daily briefs
const STORAGE_KEY = "travel-os-daily-brief";

export interface DailyBriefConfig {
  enabled: boolean;
  hour: number;   // 0-23
  minute: number;
}

export function getBriefConfig(): DailyBriefConfig {
  if (typeof localStorage === "undefined") return { enabled: false, hour: 8, minute: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DailyBriefConfig;
  } catch { /* ignore */ }
  return { enabled: false, hour: 8, minute: 0 };
}

export function setBriefConfig(cfg: DailyBriefConfig): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

interface BriefInput {
  destination: string;
  daysUntilTrip: number;          // negative if in-trip, 0 = today, positive = pre-trip
  todayEvents: number;
  nextThing?: string;
  criticalAlerts?: number;
}

function buildMessage(input: BriefInput): { title: string; body: string } {
  const days = input.daysUntilTrip;
  if (days > 0 && days < 14) {
    return {
      title: `Faltan ${days} días para ${input.destination}`,
      body: input.criticalAlerts && input.criticalAlerts > 0
        ? `${input.criticalAlerts} alerta(s) crítica(s). Abrí Tampu.`
        : "Revisá si todo está listo en la app.",
    };
  }
  if (days === 0 || days < 0) {
    if (input.todayEvents > 0) {
      return {
        title: `Hoy: ${input.nextThing || `${input.todayEvents} eventos en ${input.destination}`}`,
        body: `${input.todayEvents} cosas programadas hoy.`,
      };
    }
    return {
      title: `Día libre en ${input.destination}`,
      body: "No tenés nada agendado para hoy.",
    };
  }
  return {
    title: `Tu próximo viaje: ${input.destination}`,
    body: `Faltan ${days} días.`,
  };
}

/** Schedule tomorrow's brief at the configured hour. Cancels previous. */
export async function scheduleDailyBrief(input: BriefInput): Promise<boolean> {
  if (!(await isNative())) return false;
  const cfg = getBriefConfig();
  if (!cfg.enabled) return false;
  await cancelReminder(ID_BASE);
  const now = new Date();
  const fire = new Date();
  fire.setHours(cfg.hour, cfg.minute, 0, 0);
  if (fire <= now) fire.setDate(fire.getDate() + 1);    // tomorrow
  const { title, body } = buildMessage(input);
  return scheduleReminder({ id: ID_BASE, title, body, fireAt: fire });
}

export async function cancelDailyBrief(): Promise<void> {
  if (!(await isNative())) return;
  await cancelReminder(ID_BASE);
}
