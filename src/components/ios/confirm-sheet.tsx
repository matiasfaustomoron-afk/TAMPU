"use client";

// ─── ConfirmSheet ──────────────────────────────────────────────────────────
//
// Reemplazo iOS-style del `window.confirm()` nativo. Usamos el primitivo `Sheet`
// existente (drag-to-dismiss, backdrop blur, escape key) y montamos un layout
// simple: título + mensaje + dos botones. Para acciones destructivas el primary
// se tiñe rojo (var(--destructive)).
//
// API:
//   <ConfirmSheet
//     open
//     onClose={() => ...}        // dispara cancel
//     onConfirm={() => ...}      // dispara confirm (parent debe cerrar)
//     title="¿Eliminar viaje?"
//     message="Esto borra todos los días, reservas y gastos. No se puede deshacer."
//     destructive
//     confirmLabel="Eliminar"
//   />
//
// El hook `useConfirmSheet` (en src/lib/hooks/use-confirm-sheet.tsx) maneja
// state + promise-style API para los call-sites: `await confirm({...})`.

import { Sheet } from "@/components/ios";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils/helpers";

export interface ConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string;
  /** Default i18n: t.common.confirm.default ("Confirmar"). */
  confirmLabel?: string;
  /** Default i18n: t.common.confirm.cancel ("Cancelar"). */
  cancelLabel?: string;
  /** Si true, el botón primario va rojo (destructive). */
  destructive?: boolean;
}

export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
}: ConfirmSheetProps) {
  const { t } = useI18n();
  const confirmText = confirmLabel ?? (destructive ? t.common.confirm.deleteAction : t.common.confirm.default);
  const cancelText = cancelLabel ?? t.common.confirm.cancel;

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-5 pb-2">
        {message && (
          <p className="text-[14px] leading-relaxed text-muted-foreground">{message}</p>
        )}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="pressable flex-1 rounded-2xl bg-muted py-3 text-[15px] font-semibold text-foreground focus-ring-inline"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "pressable flex-1 rounded-2xl py-3 text-[15px] font-semibold focus-ring-inline",
              destructive
                ? "bg-[var(--destructive)] text-white"
                : "bg-primary text-primary-foreground",
            )}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
