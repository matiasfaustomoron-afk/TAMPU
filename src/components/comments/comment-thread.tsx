"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { MessageCircle, Send, ChevronDown, ChevronRight, Trash2, CheckCircle2, RotateCcw, SmilePlus } from "lucide-react";
import {
  getComments,
  addComment,
  deleteComment,
  resolveComment,
  unresolveComment,
  toggleReaction,
  buildThread,
  commentAgo,
  REACTION_EMOJIS,
  type Comment,
  type ItemType,
} from "@/lib/comments/comment";
import { useSupabase } from "@/lib/context/supabase-provider";
import { logActivity } from "@/lib/collab/activity-feed";
import { haptic } from "@/lib/native/platform";

interface Props {
  tripId: string;
  itemType: ItemType;
  itemId: string;
  /** Member list para autocomplete de @mentions. */
  members?: Array<{ id: string; display_name: string; handle?: string }>;
  /** Si true (default), el panel arranca cerrado y se expande on demand. */
  collapsible?: boolean;
}

/**
 * <CommentThread /> — panel de comentarios threaded para cualquier item.
 *
 * UX:
 *   - Cerrado por default: "3 comentarios" + chevron. Click → expande.
 *   - Lista de root threads (1-level). Reply abre composer inline.
 *   - Composer: autosize textarea, Cmd/Ctrl+Enter submitea.
 *   - Mentions: tipear "@" muestra dropdown de members.
 */
export function CommentThread({
  tripId, itemType, itemId, members = [], collapsible = true,
}: Props) {
  const { user } = useSupabase();
  const userId = user?.id || "demo-user";
  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Tú";

  const [expanded, setExpanded] = useState(!collapsible);
  const [comments, setComments] = useState<Comment[]>([]);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const refresh = useCallback(() => {
    setComments(getComments(tripId, itemType, itemId));
  }, [tripId, itemType, itemId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Filter threads: ocultar roots resueltos por default (QW5).
  const visibleComments = useMemo(() => {
    if (showResolved) return comments;
    const resolvedRootIds = new Set(
      comments.filter(c => !c.parent_id && c.resolved_at).map(c => c.id)
    );
    return comments.filter(c => {
      if (!c.parent_id && c.resolved_at) return false;
      if (c.parent_id && resolvedRootIds.has(c.parent_id)) return false;
      return true;
    });
  }, [comments, showResolved]);

  const threads = useMemo(() => buildThread(visibleComments), [visibleComments]);
  // Counter: solo abiertos no eliminados
  const activeCount = useMemo(() => {
    const resolvedRootIds = new Set(
      comments.filter(c => !c.parent_id && c.resolved_at).map(c => c.id)
    );
    return comments.filter(c =>
      !c.deleted_at &&
      !(c.parent_id === null && c.resolved_at) &&
      !(c.parent_id && resolvedRootIds.has(c.parent_id))
    ).length;
  }, [comments]);
  const resolvedCount = comments.filter(c => !c.parent_id && c.resolved_at).length;

  const handleSubmit = useCallback((body: string, parentId: string | null) => {
    if (!body.trim()) return;
    addComment({
      tripId,
      itemType,
      itemId,
      parentId,
      authorId: userId,
      authorName: displayName,
      body,
    });
    haptic("light");
    logActivity({
      tripId,
      userId,
      displayName,
      kind: "comment_added",
      summary: `comentó en un ${itemType}`,
      href: null,
    });
    refresh();
    setReplyTo(null);
  }, [tripId, itemType, itemId, userId, displayName, refresh]);

  const handleDelete = useCallback((commentId: string) => {
    if (!confirm("¿Eliminar este comentario?")) return;
    deleteComment(tripId, commentId);
    refresh();
  }, [tripId, refresh]);

  const handleResolve = useCallback((commentId: string, isResolved: boolean) => {
    if (isResolved) {
      unresolveComment(tripId, commentId);
    } else {
      resolveComment(tripId, commentId, { id: userId, displayName });
    }
    haptic("light");
    refresh();
  }, [tripId, userId, displayName, refresh]);

  const handleReaction = useCallback((commentId: string, emoji: string) => {
    toggleReaction(tripId, commentId, emoji, userId);
    haptic("light");
    refresh();
  }, [tripId, userId, refresh]);

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <button
        onClick={() => collapsible && setExpanded(e => !e)}
        className="w-full flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors pressable"
        disabled={!collapsible}
      >
        <MessageCircle className="w-3 h-3" />
        <span>
          {activeCount === 0 ? "Comentar" : `${activeCount} comentario${activeCount === 1 ? "" : "s"}`}
        </span>
        {collapsible && (
          expanded
            ? <ChevronDown className="w-3 h-3 ml-auto" />
            : <ChevronRight className="w-3 h-3 ml-auto" />
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {resolvedCount > 0 && (
            <button
              onClick={() => setShowResolved(s => !s)}
              className="text-[10.5px] text-muted-foreground hover:text-foreground pressable"
            >
              {showResolved ? "Ocultar resueltos" : `Mostrar ${resolvedCount} resuelto${resolvedCount === 1 ? "" : "s"}`}
            </button>
          )}
          {threads.length === 0 ? (
            <Composer
              members={members}
              placeholder="Escribí un comentario…"
              onSubmit={body => handleSubmit(body, null)}
              autoFocus={false}
            />
          ) : (
            <>
              <ul className="space-y-2">
                {threads.map(t => (
                  <li key={t.root.id} className={`space-y-1.5 ${t.root.resolved_at ? "opacity-60" : ""}`}>
                    <CommentRow
                      comment={t.root}
                      userId={userId}
                      onReply={() => setReplyTo(t.root.id)}
                      onDelete={() => handleDelete(t.root.id)}
                      onResolve={() => handleResolve(t.root.id, !!t.root.resolved_at)}
                      onReaction={(emoji) => handleReaction(t.root.id, emoji)}
                    />
                    {t.replies.length > 0 && (
                      <ul className="pl-6 space-y-1.5">
                        {t.replies.map(r => (
                          <CommentRow
                            key={r.id}
                            comment={r}
                            userId={userId}
                            isReply
                            onReply={() => setReplyTo(t.root.id)}
                            onDelete={() => handleDelete(r.id)}
                            onReaction={(emoji) => handleReaction(r.id, emoji)}
                          />
                        ))}
                      </ul>
                    )}
                    {replyTo === t.root.id && (
                      <div className="pl-6">
                        <Composer
                          members={members}
                          placeholder={`Responder a ${t.root.author_name}…`}
                          onSubmit={body => handleSubmit(body, t.root.id)}
                          onCancel={() => setReplyTo(null)}
                          autoFocus
                          compact
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {/* New root comment composer */}
              <Composer
                members={members}
                placeholder="Agregar comentario…"
                onSubmit={body => handleSubmit(body, null)}
                autoFocus={false}
                compact
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CommentRow({
  comment, userId, isReply, onReply, onDelete, onResolve, onReaction,
}: {
  comment: Comment;
  userId: string;
  isReply?: boolean;
  onReply: () => void;
  onDelete: () => void;
  onResolve?: () => void;
  onReaction?: (emoji: string) => void;
}) {
  const isMine = comment.author_id === userId;
  const deleted = !!comment.deleted_at;
  const resolved = !!comment.resolved_at;
  const reactions = comment.reactions || {};
  const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="text-[12.5px] leading-snug">
      <div className="flex items-baseline gap-1.5">
        <span className="font-semibold">{comment.author_name}</span>
        <span className="text-[10.5px] text-muted-foreground">{commentAgo(comment.created_at)}</span>
        {resolved && (
          <span className="text-[10px] text-success font-medium">
            ✓ Resuelto{comment.resolved_by_name ? ` por ${comment.resolved_by_name}` : ""}
          </span>
        )}
        {!deleted && !isReply && (
          <button
            onClick={onReply}
            className="text-[10.5px] text-muted-foreground hover:text-primary ml-1 pressable"
          >
            responder
          </button>
        )}
        {!deleted && onReaction && (
          <button
            onClick={() => setPickerOpen(p => !p)}
            className="text-muted-foreground hover:text-foreground p-0.5 pressable"
            aria-label="Reaccionar"
          >
            <SmilePlus className="w-3 h-3" />
          </button>
        )}
        {!deleted && !isReply && onResolve && (
          <button
            onClick={onResolve}
            className={`p-0.5 pressable ${resolved ? "text-success" : "text-muted-foreground hover:text-success"}`}
            aria-label={resolved ? "Reabrir" : "Resolver"}
            title={resolved ? "Reabrir" : "Resolver"}
          >
            {resolved ? <RotateCcw className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
          </button>
        )}
        {!deleted && isMine && (
          <button
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive ml-auto p-0.5 pressable"
            aria-label="Eliminar"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>
      <p className={deleted ? "italic text-muted-foreground" : "whitespace-pre-wrap"}>
        {/* Highlight @mentions visually */}
        {deleted ? comment.body : renderMentions(comment.body, comment.mentions)}
      </p>
      {/* Reaction pills + picker */}
      {(reactionEntries.length > 0 || pickerOpen) && !deleted && (
        <div className="flex flex-wrap items-center gap-1 mt-1">
          {reactionEntries.map(([emoji, users]) => {
            const mine = users.includes(userId);
            return (
              <button
                key={emoji}
                onClick={() => onReaction?.(emoji)}
                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10.5px] pressable border ${
                  mine ? "bg-primary/15 border-primary/30 text-primary" : "bg-muted/40 border-transparent text-muted-foreground hover:text-foreground"
                }`}
                aria-label={`${emoji} ${users.length}`}
              >
                <span>{emoji}</span>
                <span className="tabular-nums font-medium">{users.length}</span>
              </button>
            );
          })}
          {pickerOpen && (
            <div className="inline-flex gap-0.5 ios-card px-1 py-0.5 rounded-full">
              {REACTION_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { onReaction?.(emoji); setPickerOpen(false); }}
                  className="text-[14px] px-1 hover:scale-110 transition-transform pressable"
                  aria-label={`Reaccionar ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function renderMentions(body: string, mentions: string[]): React.ReactNode {
  if (mentions.length === 0) return body;
  // Replace @handle con un span destacado, sin riesgo de XSS porque React escapa.
  const parts = body.split(/(@[a-z0-9_.-]{2,30})/gi);
  return parts.map((p, i) => {
    if (p.startsWith("@") && mentions.includes(p.slice(1).toLowerCase())) {
      return <span key={i} className="text-primary font-medium">{p}</span>;
    }
    return <span key={i}>{p}</span>;
  });
}

function Composer({
  members, placeholder, onSubmit, onCancel, autoFocus, compact,
}: {
  members: Array<{ id: string; display_name: string; handle?: string }>;
  placeholder: string;
  onSubmit: (body: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [value, setValue] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autosize
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(160, ta.scrollHeight) + "px";
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setValue(v);
    // Detect "@..." at the caret for autocomplete
    const caret = e.target.selectionStart;
    const before = v.slice(0, caret);
    const m = before.match(/@([a-z0-9_.-]{0,30})$/i);
    setMentionQuery(m ? m[1].toLowerCase() : null);
  };

  const submit = useCallback(() => {
    if (!value.trim()) return;
    onSubmit(value);
    setValue("");
    setMentionQuery(null);
  }, [value, onSubmit]);

  const pickMention = (handle: string) => {
    setValue(v => {
      const re = /@([a-z0-9_.-]{0,30})$/i;
      return v.replace(re, `@${handle} `);
    });
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  const filteredMembers = useMemo(() => {
    if (mentionQuery === null) return [];
    return members.filter(m =>
      (m.handle || m.display_name).toLowerCase().includes(mentionQuery)
    ).slice(0, 5);
  }, [members, mentionQuery]);

  return (
    <div className="relative">
      <div className={"flex gap-1.5 items-end " + (compact ? "" : "ios-card p-2")}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape" && onCancel) {
              e.preventDefault();
              onCancel();
            }
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          rows={compact ? 1 : 2}
          className="flex-1 resize-none bg-muted/30 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/40"
          style={{ minHeight: 36 }}
        />
        <button
          onClick={submit}
          disabled={!value.trim()}
          className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 pressable shrink-0"
          aria-label="Enviar"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-[11px] text-muted-foreground hover:text-foreground pressable"
          >
            cancelar
          </button>
        )}
      </div>

      {/* Mention autocomplete dropdown */}
      {mentionQuery !== null && filteredMembers.length > 0 && (
        <ul className="absolute bottom-full mb-1 left-0 right-12 ios-card shadow-lg z-50 max-h-40 overflow-y-auto">
          {filteredMembers.map(m => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => pickMention(m.handle || m.display_name.toLowerCase().replace(/\s+/g, ""))}
                className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-accent pressable"
              >
                <span className="font-medium">@{m.handle || m.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
