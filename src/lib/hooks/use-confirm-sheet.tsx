"use client";

// ─── useConfirmSheet ───────────────────────────────────────────────────────
//
// Hook que reemplaza el `window.confirm()` nativo por un Sheet iOS-style con
// promise-style API. El call-site queda casi idéntico al confirm() original:
//
//   const { confirm, sheet } = useConfirmSheet();
//   // ... en un handler:
//   if (!(await confirm({ title: "¿Eliminar?", message: "...", destructive: true }))) return;
//   // ... y al final del JSX del componente:
//   return <>{...content}{sheet}</>;
//
// La promise resuelve `true` si el user toca el botón primario, `false` si
// dismissó (backdrop click, drag down, escape, o tap en Cancelar).
//
// TODO Iter 7: migrar los 7 confirm() restantes a este hook:
//   - src/app/(app)/passcode/page.tsx
//   - src/app/(app)/journal/page.tsx
//   - src/app/(app)/settings/page.tsx (4 sitios)
//   - src/app/(app)/tasks/[id]/page.tsx
//   - src/app/(app)/trips/page.tsx
// Esta iter (Iter 6 post-audit) cubre solo los 4 más visibles:
// vault, itinerary, members, expenses.

import { useCallback, useState } from "react";
import { ConfirmSheet } from "@/components/ios/confirm-sheet";

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface InternalState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function useConfirmSheet() {
  const [state, setState] = useState<InternalState | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (!state) return;
    state.resolve(true);
    setState(null);
  }, [state]);

  const handleClose = useCallback(() => {
    if (!state) return;
    state.resolve(false);
    setState(null);
  }, [state]);

  const sheet = state ? (
    <ConfirmSheet
      open
      onClose={handleClose}
      onConfirm={handleConfirm}
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      destructive={state.destructive}
    />
  ) : null;

  return { confirm, sheet };
}
