"use client";

import { useEffect } from "react";
import { useActiveTrip, useTasks, useReservations } from "@/lib/hooks/use-trip-data";
import { collectPendingItems, syncTaskReminders, areTaskRemindersEnabled } from "@/lib/task-reminders";

/**
 * Componente invisible montado dentro de AppLayout que reprograma notificaciones
 * locales nativas cada vez que cambian tasks / reservations / trip o cuando el usuario
 * activa el toggle en settings.
 *
 * No-op en web; solo emite efecto en Capacitor (iOS/Android).
 */
export function TaskRemindersSync() {
  const { data: trip } = useActiveTrip();
  const { data: tasks } = useTasks(trip?.id);
  const { data: reservations } = useReservations(trip?.id);

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      const enabled = await areTaskRemindersEnabled();
      if (cancelled || !enabled) return;
      const items = collectPendingItems(tasks ?? [], reservations ?? []);
      await syncTaskReminders(items);
    };

    sync();

    const onSettingsChange = () => sync();
    window.addEventListener("tampu-reminders-changed", onSettingsChange);
    return () => {
      cancelled = true;
      window.removeEventListener("tampu-reminders-changed", onSettingsChange);
    };
  }, [tasks, reservations]);

  return null;
}
