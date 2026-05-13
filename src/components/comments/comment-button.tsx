"use client";

import { useState, useSyncExternalStore, useCallback } from "react";
import { MessageCircle, ChevronDown, ChevronRight } from "lucide-react";
import { CommentThread } from "./comment-thread";
import { countComments, type ItemType } from "@/lib/comments/comment";

interface Props {
  tripId: string;
  itemType: ItemType;
  itemId: string;
  /** Member list para autocomplete de @mentions en el thread. */
  members?: Array<{ id: string; display_name: string; handle?: string }>;
  /** Si true, el thread arranca expandido al primer render. Default false. */
  defaultOpen?: boolean;
  className?: string;
}

/**
 * <CommentButton /> — botón compacto "X comentarios" que abre/cierra un
 * thread inline debajo del item. Spec del feature 3:
 *
 *   - N=0 → "💬 Comentar"
 *   - N>0 → "💬 N comentarios" + indigo (Hornocal palette)
 *   - Click → expande el `<CommentThread />`
 *
 * Se renderiza separado del IOSRow para no tocar
 * `src/components/ios/index.tsx` (territorio prohibido — otro agente trabaja
 * ahí). Drop-in en el footer de cualquier card de item.
 */
export function CommentButton({
  tripId, itemType, itemId, members,
  defaultOpen = false, className,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  // useSyncExternalStore evita el lint warning de "setState in effect" y es
  // el patrón canónico de React 19 para subs a external state.
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("storage", onChange);
    window.addEventListener("tampu:comments-changed", onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener("tampu:comments-changed", onChange);
    };
  }, []);
  const getSnapshot = useCallback(
    () => countComments(tripId, itemType, itemId),
    [tripId, itemType, itemId]
  );
  // Server snapshot = 0 (no localStorage en SSR)
  const count = useSyncExternalStore(subscribe, getSnapshot, () => 0);

  const hasComments = count > 0;
  const Icon = open ? ChevronDown : ChevronRight;

  return (
    <div className={className}>
      <button
        onClick={() => setOpen(o => !o)}
        className={
          "pressable inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold transition-colors " +
          (hasComments
            ? "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300"
            : "bg-muted text-muted-foreground hover:text-foreground")
        }
        aria-expanded={open}
        aria-label={hasComments ? `${count} comentarios` : "Agregar comentario"}
      >
        <MessageCircle className="w-3 h-3" />
        <span>
          {hasComments ? `${count} comentario${count === 1 ? "" : "s"}` : "Comentar"}
        </span>
        <Icon className="w-3 h-3 opacity-70" aria-hidden />
      </button>

      {open && (
        <div className="mt-2">
          <CommentThread
            tripId={tripId}
            itemType={itemType}
            itemId={itemId}
            members={members}
            collapsible={false}
          />
        </div>
      )}
    </div>
  );
}
