"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Vote, Trash2, CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  tallyVotes,
  isPollClosed,
  deadlineText,
  voteLocalPoll,
  deleteLocalPoll,
  type Poll,
} from "@/lib/polls/poll";
import { useSupabase } from "@/lib/context/supabase-provider";
import { logActivity } from "@/lib/collab/activity-feed";
import { haptic } from "@/lib/native/platform";
import { toast } from "@/components/ios/toast";

interface Props {
  poll: Poll;
  onChange?: (poll: Poll | null) => void;
}

/**
 * <PollCard /> — visualización de un poll con voto + tally + countdown.
 *
 * Layout:
 *   - Header: pregunta + creator + countdown
 *   - Lista de opciones: cada una con barra de progress + count
 *   - Voto: tap una opción → registra (haptic) → onChange
 *   - Cierre: si tu sos el creator, podés cerrar manualmente
 */
export function PollCard({ poll, onChange }: Props) {
  const { user } = useSupabase();
  const userId = user?.id || "demo-user";
  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Tú";
  const [now, setNow] = useState(() => Date.now());

  // Tick para mantener vivo el countdown
  useEffect(() => {
    if (!poll.deadline) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [poll.deadline]);

  const closed = useMemo(() => isPollClosed(poll), [poll, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const tally = useMemo(() => tallyVotes(poll), [poll]);
  const totalVotes = Object.keys(poll.votes).length;
  const myVote = poll.votes[userId];

  const handleVote = useCallback((optionId: string) => {
    const updated = voteLocalPoll(poll.trip_id, poll.id, userId, displayName, optionId);
    haptic("light");
    if (updated) {
      onChange?.(updated);
      logActivity({
        tripId: poll.trip_id,
        userId,
        displayName,
        kind: "poll_voted",
        summary: `votó "${poll.options.find(o => o.id === optionId)?.label}" en "${poll.question}"`,
        href: null,
      });
    }
  }, [poll, userId, displayName, onChange]);

  const handleDelete = useCallback(() => {
    if (!confirm(`¿Eliminar el poll "${poll.question}"?`)) return;
    deleteLocalPoll(poll.trip_id, poll.id);
    onChange?.(null);
    toast("Poll eliminado", "info");
  }, [poll, onChange]);

  const canDelete = poll.created_by === userId;

  return (
    <div className="ios-card p-4">
      {/* Header */}
      <div className="flex items-start gap-2 mb-3">
        <span className="w-8 h-8 rounded-xl tampu-icon tampu-icon-mostaza flex items-center justify-center shrink-0">
          <Vote className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold leading-tight">{poll.question}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
            <span>{poll.created_by_name}</span>
            <span>·</span>
            <span className={closed ? "text-warning" : ""}>
              <Clock className="w-3 h-3 inline mr-0.5" />
              {deadlineText(poll)}
            </span>
            <span>·</span>
            <span>{totalVotes} voto{totalVotes === 1 ? "" : "s"}</span>
          </p>
        </div>
        {canDelete && (
          <button
            onClick={handleDelete}
            className="text-muted-foreground hover:text-destructive p-1 pressable"
            aria-label="Eliminar poll"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Options */}
      <ul className="space-y-1.5">
        {poll.options.map(opt => {
          const t = tally.find(x => x.optionId === opt.id)!;
          const mine = myVote === opt.id;
          return (
            <li key={opt.id}>
              <button
                onClick={() => !closed && handleVote(opt.id)}
                disabled={closed}
                className={
                  "w-full text-left rounded-xl p-2.5 transition-colors relative overflow-hidden " +
                  (mine ? "bg-primary/15 ring-2 ring-primary/40"
                    : closed ? "bg-muted cursor-default"
                    : "bg-muted/40 hover:bg-muted pressable")
                }
              >
                {/* Progress fill */}
                <div
                  className="absolute inset-y-0 left-0 bg-primary/10 transition-[width]"
                  style={{ width: `${t.percent}%` }}
                  aria-hidden
                />
                <div className="relative flex items-center gap-2">
                  <span className="text-[11px] font-bold tabular-nums w-6 text-muted-foreground">{opt.id}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium leading-tight truncate">{opt.label}</p>
                    {opt.description && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{opt.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {mine && <CheckCircle className="w-3.5 h-3.5 text-primary" />}
                    <span className="text-[11px] font-bold tabular-nums w-9 text-right">
                      {t.count} · {t.percent}%
                    </span>
                  </div>
                </div>
              </button>
              {t.voters.length > 0 && (
                <p className="text-[10px] text-muted-foreground pl-9 mt-0.5 truncate">
                  {t.voters.slice(0, 3).join(", ")}{t.voters.length > 3 ? ` +${t.voters.length - 3}` : ""}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
