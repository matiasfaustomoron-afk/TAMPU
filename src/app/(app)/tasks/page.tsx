"use client";
import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectNative } from "@/components/ui/select-native";
import { StatusBadge, PriorityBadge, EmptyState, SectionHeader } from "@/components/shared";
import { useActiveTrip, useTasks, useMutations } from "@/lib/hooks/use-trip-data";
import { useI18n } from "@/i18n/provider";
import { daysUntil } from "@/lib/utils/helpers";
import { TASK_CATEGORIES, TASK_STATUSES, PRIORITIES } from "@/lib/config/constants";
import { CheckSquare, Search, Filter, Check, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import type { Task } from "@/lib/types/database";

export default function TasksPage() {
  const { t, formatDate } = useI18n();
  const { data: trip } = useActiveTrip();
  const { data: tasks, loading, refetch } = useTasks(trip?.id);
  const { updateTask } = useMutations();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const list = useMemo(() => tasks ?? [], [tasks]);
  const filtered = useMemo(() => {
    let r = list;
    if (search) { const q = search.toLowerCase(); r = r.filter(t => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)); }
    if (filterStatus !== "all") r = r.filter(t => t.status === filterStatus);
    if (filterCategory !== "all") r = r.filter(t => t.category === filterCategory);
    if (filterPriority !== "all") r = r.filter(t => t.priority === filterPriority);
    const pw: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return r.sort((a, b) => { if (a.status === "done" && b.status !== "done") return 1; if (a.status !== "done" && b.status === "done") return -1; return (pw[b.priority] || 0) - (pw[a.priority] || 0); });
  }, [list, search, filterStatus, filterCategory, filterPriority]);
  const toggle = useCallback(async (tk: Task) => { const ns = tk.status === "done" ? "pending" as const : "done" as const; await updateTask(tk.id, { status: ns, progress: ns === "done" ? 100 : 0 }); refetch(); }, [updateTask, refetch]);
  const now = new Date().toISOString().split("T")[0];
  const stats = useMemo(() => ({ total: list.length, done: list.filter(x => x.status === "done").length, critical: list.filter(x => x.priority === "critical" && x.status !== "done").length, overdue: list.filter(x => x.due_date && x.due_date < now && x.status !== "done").length }), [list, now]);
  if (loading) return <div className="animate-pulse space-y-4">{[1,2,3].map(i=><div key={i} className="h-16 bg-muted rounded-lg" />)}</div>;
  return (
    <div className="space-y-4 pb-20 lg:pb-0 animate-fade-in">
      <SectionHeader title={t.tasks.title} subtitle={`${stats.done}/${stats.total} · ${stats.critical} ${t.dashboard.critical.toLowerCase()} · ${stats.overdue} ${t.common.overdue.toLowerCase()}`} />
      <div className="space-y-2">
        <div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder={t.tasks.searchPlaceholder} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" /></div><Button variant="outline" size="icon" onClick={() => setShowFilters(!showFilters)}><Filter className="w-4 h-4" /></Button></div>
        {showFilters && <div className="grid grid-cols-3 gap-2"><SelectNative value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="all">{t.tasks.allStatus}</option>{TASK_STATUSES.map(s => <option key={s.value} value={s.value}>{t.status[s.value as keyof typeof t.status] || s.label}</option>)}</SelectNative><SelectNative value={filterCategory} onChange={e => setFilterCategory(e.target.value)}><option value="all">{t.tasks.allCategories}</option>{TASK_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</SelectNative><SelectNative value={filterPriority} onChange={e => setFilterPriority(e.target.value)}><option value="all">{t.tasks.allPriorities}</option>{PRIORITIES.map(p => <option key={p.value} value={p.value}>{t.priority[p.value as keyof typeof t.priority] || p.label}</option>)}</SelectNative></div>}
      </div>
      <div className="space-y-1.5">
        {filtered.length === 0 ? <EmptyState title={t.tasks.noTasksFound} description={t.tasks.adjustFilters} icon={<CheckSquare className="w-8 h-8" />} /> : filtered.map(task => {
          const exp = expandedId === task.id; const dl = task.due_date ? daysUntil(task.due_date) : null; const ov = dl !== null && dl < 0 && task.status !== "done";
          return (<div key={task.id} className="border rounded-lg bg-card overflow-hidden"><div className="flex items-center gap-3 p-3">
            <button onClick={() => toggle(task)} className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${task.status === "done" ? "bg-success border-success text-white" : "border-muted-foreground/30 hover:border-primary"}`}>{task.status === "done" && <Check className="w-3 h-3" />}</button>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedId(exp ? null : task.id)}><p className={`text-sm font-medium truncate ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>{task.title}</p><div className="flex items-center gap-1.5 mt-1 flex-wrap"><PriorityBadge priority={task.priority} /><span className="text-[10px] text-muted-foreground capitalize">{task.category}</span>{task.city_name && <span className="text-[10px] text-muted-foreground">· {task.city_name}</span>}</div></div>
            <div className="shrink-0 text-right">{dl !== null && <span className={`text-xs font-medium ${ov ? "text-destructive" : dl <= 7 ? "text-primary" : "text-muted-foreground"}`}>{ov ? `${Math.abs(dl)}d ${t.common.late}` : dl === 0 ? t.common.today : `${dl}d`}</span>}<button onClick={() => setExpandedId(exp ? null : task.id)} className="ml-2 text-muted-foreground">{exp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button></div>
          </div>{exp && <div className="px-3 pb-3 border-t bg-muted/20 space-y-2 text-sm">{task.description && <p className="text-muted-foreground">{task.description}</p>}<div className="grid grid-cols-2 gap-2 text-xs"><div><span className="text-muted-foreground">{t.tasks.status}:</span> <StatusBadge status={task.status} /></div><div><span className="text-muted-foreground">{t.tasks.criticality}:</span> <span className="capitalize">{t.criticality[task.criticality as keyof typeof t.criticality] || task.criticality}</span></div>{task.due_date && <div><span className="text-muted-foreground">{t.tasks.due}:</span> {formatDate(task.due_date, "long")}</div>}{task.next_action && <div className="col-span-2"><span className="text-muted-foreground">{t.tasks.nextAction}:</span> {task.next_action}</div>}{task.notes && <div className="col-span-2"><span className="text-muted-foreground">{t.tasks.notes}:</span> {task.notes}</div>}{task.is_blocker && <div className="col-span-2"><span className="text-destructive font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {t.tasks.blocker}</span></div>}</div>{task.status !== "done" && <div className="flex gap-2 pt-1"><Button size="sm" variant="outline" onClick={async () => { await updateTask(task.id, { status: "in_progress" }); refetch(); }}>{t.common.start}</Button><Button size="sm" onClick={() => toggle(task)}>{t.common.complete}</Button></div>}</div>}</div>);
        })}
      </div>
    </div>
  );
}
