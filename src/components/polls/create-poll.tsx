"use client";

import { useState, useCallback } from "react";
import { Plus, X, Vote } from "lucide-react";
import { Sheet } from "@/components/ios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createLocalPoll, createPollOnline, type Poll } from "@/lib/polls/poll";
import { useSupabase } from "@/lib/context/supabase-provider";
import { useI18n } from "@/i18n/provider";
import { logActivity } from "@/lib/collab/activity-feed";
import { haptic } from "@/lib/native/platform";
import { toast } from "@/components/ios/toast";

/**
 * <CreatePoll /> — botón + sheet para crear un nuevo poll.
 *
 * El componente expone solo el trigger. La sheet con form se monta dentro.
 * Si recibe `defaultOptions`, prefilea (útil para "vs" contextuales: dos
 * hoteles posibles → click una IOSRow → "crear poll A vs B").
 */
export function CreatePoll({
  tripId,
  defaultQuestion,
  defaultOptions,
  onCreated,
  variant = "row",
}: {
  tripId: string;
  defaultQuestion?: string;
  defaultOptions?: Array<{ label: string; description?: string }>;
  onCreated?: (poll: Poll) => void;
  variant?: "row" | "compact";
}) {
  const { user, client, mode } = useSupabase();
  const { t } = useI18n();
  const pc = t.pollsCreate;
  const userId = user?.id || "demo-user";
  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Tú";

  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState(defaultQuestion || "");
  const [options, setOptions] = useState<Array<{ label: string; description: string }>>(
    defaultOptions && defaultOptions.length >= 2
      ? defaultOptions.map(o => ({ label: o.label, description: o.description || "" }))
      : [
          { label: "", description: "" },
          { label: "", description: "" },
        ]
  );
  const [deadline, setDeadline] = useState("");

  const updateOption = (idx: number, field: "label" | "description", value: string) => {
    setOptions(opts => opts.map((o, i) => (i === idx ? { ...o, [field]: value } : o)));
  };

  const addOption = () => {
    setOptions(opts => opts.length < 6 ? [...opts, { label: "", description: "" }] : opts);
  };

  const removeOption = (idx: number) => {
    setOptions(opts => opts.length > 2 ? opts.filter((_, i) => i !== idx) : opts);
  };

  const handleCreate = useCallback(async () => {
    const valid = options.filter(o => o.label.trim()).map(o => ({
      label: o.label.trim(),
      description: o.description.trim() || undefined,
    }));
    if (!question.trim() || valid.length < 2) {
      toast(pc.validationMinTwo, "warn");
      return;
    }
    const input = {
      tripId,
      question: question.trim(),
      options: valid,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      userId,
      displayName,
    };
    let poll: Poll | null = null;
    if (mode === "online" && client) {
      poll = await createPollOnline(client, input);
      // Si online falla (tabla missing / network), fallback a local para no
      // perder el input del user.
      if (!poll) poll = createLocalPoll(input);
    } else {
      poll = createLocalPoll(input);
    }
    haptic("medium");
    toast(pc.successToast, "success");
    logActivity({
      tripId,
      userId,
      displayName,
      kind: "poll_created",
      summary: `creó la encuesta "${question.trim()}"`,
      href: null,
    });
    onCreated?.(poll);
    // Reset
    setOpen(false);
    setQuestion(defaultQuestion || "");
    setOptions([{ label: "", description: "" }, { label: "", description: "" }]);
    setDeadline("");
  }, [tripId, question, options, deadline, userId, displayName, defaultQuestion, onCreated, mode, client, pc]);

  return (
    <>
      {variant === "row" ? (
        <button
          onClick={() => setOpen(true)}
          className="pressable w-full flex items-center justify-center gap-2 h-11 rounded-2xl border border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors text-[13px] font-semibold"
        >
          <Vote className="w-4 h-4" /> {pc.createTrigger}
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="pressable inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted text-[11.5px] font-semibold"
        >
          <Vote className="w-3 h-3" /> {pc.createCompact}
        </button>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title={pc.title}>
        <div className="space-y-3 pb-4">
          <div>
            <label className="text-[10px] uppercase text-muted-foreground tracking-wider">{pc.question}</label>
            <Textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder={pc.questionPlaceholder}
              autoFocus
              rows={2}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] uppercase text-muted-foreground tracking-wider">{pc.options}</label>
              <button
                onClick={addOption}
                disabled={options.length >= 6}
                className="text-[11px] text-primary font-semibold disabled:opacity-40 pressable"
              >
                {pc.addOption}
              </button>
            </div>
            <ul className="space-y-2">
              {options.map((o, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-6 h-9 flex items-center justify-center text-[12px] font-bold text-muted-foreground tabular-nums shrink-0">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <div className="flex-1 space-y-1">
                    <Input
                      value={o.label}
                      onChange={e => updateOption(i, "label", e.target.value)}
                      placeholder={`${pc.optionPlaceholder} ${String.fromCharCode(65 + i)}`}
                    />
                    <Input
                      value={o.description}
                      onChange={e => updateOption(i, "description", e.target.value)}
                      placeholder={pc.detailOptional}
                      className="text-[12.5px]"
                    />
                  </div>
                  {options.length > 2 && (
                    <button
                      onClick={() => removeOption(i)}
                      className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-destructive pressable"
                      aria-label={pc.removeAria}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <label className="text-[10px] uppercase text-muted-foreground tracking-wider">
              {pc.deadlineOptional}
            </label>
            <Input
              type="datetime-local"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
            />
            <p className="text-[10.5px] text-muted-foreground mt-1">
              {pc.deadlineHint}
            </p>
          </div>

          <Button onClick={handleCreate} size="lg" className="w-full gap-1">
            <Plus className="w-4 h-4" /> {pc.submit}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
