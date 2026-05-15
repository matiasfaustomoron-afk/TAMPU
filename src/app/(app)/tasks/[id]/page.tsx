"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { LargeTitle } from "@/components/ios";
import { EmptyState } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSupabase } from "@/lib/context/supabase-provider";
import { toast } from "@/components/ios/toast";
import { haptic } from "@/lib/native/platform";
import { reportError } from "@/lib/utils/errors";
import { CheckCircle2, Circle, ChevronLeft, Pencil, Trash2, Save, X, CalendarDays, MapPin } from "lucide-react";
import type { Task } from "@/lib/types/database";

/**
 * Detalle de tarea — antes era redirect ghost a /tasks. Ahora muestra una vista
 * mínima (title, description, due_date, completed, trip_id) con acciones de
 * toggle/edit/delete. Si la task no se encuentra, empty state + link de vuelta.
 *
 * Mantenemos client.from directo (sin pasar por hooks) porque /tasks ya tiene
 * su propio cache y este es un detail spot — no queremos invalidar nada raro.
 */
export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { client, mode } = useSupabase();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftDue, setDraftDue] = useState("");
  const [busy, setBusy] = useState(false);

  // Cargar la task una vez por id
  useEffect(() => {
    if (!id) return;
    if (mode !== "online" || !client) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const { data, error } = await client
          .from("tasks")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (!alive) return;
        if (error) throw error;
        if (!data) {
          setNotFound(true);
        } else {
          const t = data as Task;
          setTask(t);
          setDraftTitle(t.title || "");
          setDraftDesc(t.description || "");
          setDraftDue(t.due_date || "");
        }
      } catch (e) {
        reportError(e, "No se pudo cargar la tarea");
        if (alive) setNotFound(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, client, mode]);

  const toggleComplete = useCallback(async () => {
    if (!task || !client) return;
    const nextStatus = task.status === "done" ? "pending" : "done";
    setBusy(true);
    try {
      const { data, error } = await client
        .from("tasks")
        .update({ status: nextStatus, progress: nextStatus === "done" ? 100 : 0 })
        .eq("id", task.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (data) setTask(data as Task);
      haptic("light");
      toast(nextStatus === "done" ? "Tarea completada" : "Tarea reabierta", "success");
    } catch (e) {
      reportError(e, "No se pudo actualizar la tarea");
    } finally {
      setBusy(false);
    }
  }, [task, client]);

  const saveEdits = useCallback(async () => {
    if (!task || !client) return;
    if (!draftTitle.trim()) {
      toast("El título es obligatorio", "warn");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await client
        .from("tasks")
        .update({
          title: draftTitle.trim(),
          description: draftDesc.trim() || null,
          due_date: draftDue || null,
        })
        .eq("id", task.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (data) setTask(data as Task);
      setEditing(false);
      haptic("medium");
      toast("Tarea actualizada", "success");
    } catch (e) {
      reportError(e, "No se pudo guardar la tarea");
    } finally {
      setBusy(false);
    }
  }, [task, client, draftTitle, draftDesc, draftDue]);

  const handleDelete = useCallback(async () => {
    if (!task || !client) return;
    if (!confirm(`¿Eliminar la tarea "${task.title}"?`)) return;
    setBusy(true);
    try {
      const { error } = await client.from("tasks").delete().eq("id", task.id);
      if (error) throw error;
      haptic("medium");
      toast("Tarea eliminada", "info");
      router.push("/tasks");
    } catch (e) {
      reportError(e, "No se pudo eliminar la tarea");
      setBusy(false);
    }
  }, [task, client, router]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4 pb-20">
        <div className="h-8 bg-muted rounded w-1/2" />
        <div className="h-32 bg-muted rounded-lg" />
      </div>
    );
  }

  if (notFound || !task) {
    return (
      <div className="animate-fade-in pb-20">
        <LargeTitle title="Tarea" serif />
        <div className="mt-8">
          <EmptyState
            title="Tarea no encontrada"
            description="Puede haber sido eliminada o no tenés permisos para verla."
            action={
              <Link href="/tasks">
                <Button variant="default" className="gap-1">
                  <ChevronLeft className="w-4 h-4" />
                  Volver a tareas
                </Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const isDone = task.status === "done";

  return (
    <div className="animate-fade-in pb-20 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/tasks" aria-label="Volver a tareas">
          <Button size="sm" variant="ghost" className="gap-1">
            <ChevronLeft className="w-4 h-4" />
            Tareas
          </Button>
        </Link>
      </div>

      <LargeTitle title={editing ? "Editar tarea" : task.title} serif />

      <Card>
        <CardContent className="p-4 space-y-4">
          {!editing ? (
            <>
              <div className="flex items-start gap-3">
                <button
                  onClick={toggleComplete}
                  disabled={busy}
                  className="pressable shrink-0 mt-0.5"
                  aria-label={isDone ? "Marcar como pendiente" : "Marcar como completada"}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-6 h-6 text-success" />
                  ) : (
                    <Circle className="w-6 h-6 text-muted-foreground" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-[15px] font-semibold leading-tight ${isDone ? "line-through text-muted-foreground" : ""}`}>
                    {task.title}
                  </p>
                  {task.description && (
                    <p className="text-[13px] text-muted-foreground mt-2 leading-snug whitespace-pre-wrap">
                      {task.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground pt-2 border-t border-border/40">
                {task.due_date && (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="w-3.5 h-3.5" />
                    Vence: {task.due_date}
                  </span>
                )}
                {task.trip_id && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    <Link href="/trips" className="underline">Viaje</Link>
                  </span>
                )}
                <span className="ml-auto inline-flex items-center gap-1">
                  Estado: <strong className="text-foreground">{task.status}</strong>
                </span>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="gap-1">
                  <Pencil className="w-3.5 h-3.5" />
                  Editar
                </Button>
                <Button size="sm" variant="destructive" onClick={handleDelete} disabled={busy} className="gap-1 ml-auto">
                  <Trash2 className="w-3.5 h-3.5" />
                  Eliminar
                </Button>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Título *</label>
                <Input
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="mt-1"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Descripción</label>
                <Textarea
                  value={draftDesc}
                  onChange={(e) => setDraftDesc(e.target.value)}
                  rows={4}
                  className="mt-1"
                  placeholder="Notas, contexto, links…"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground tracking-wider">Vencimiento</label>
                <Input
                  type="date"
                  value={draftDue}
                  onChange={(e) => setDraftDue(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Button size="sm" onClick={saveEdits} disabled={busy} className="gap-1">
                  <Save className="w-3.5 h-3.5" />
                  {busy ? "Guardando…" : "Guardar"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    setDraftTitle(task.title || "");
                    setDraftDesc(task.description || "");
                    setDraftDue(task.due_date || "");
                  }}
                  disabled={busy}
                  className="gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancelar
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
