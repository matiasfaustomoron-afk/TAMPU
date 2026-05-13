"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

/**
 * <InlineAccordion /> — expanding card sin abrir Sheet/modal.
 *
 * Reemplaza el patrón "tap → Sheet abre" con "tap → contenido expande in-place".
 * Más fluido, menos "botonera modal". Estilo Notion / Polarsteps / Apple Music.
 *
 * Mecánica:
 *  - Tap en el header → toggle expanded
 *  - Contenido animado con max-height transition + opacity
 *  - Chevron rota 180°
 *  - Outside touch NO cierra (accordion stays open hasta tap header de nuevo)
 *  - Soporta múltiples expandidos simultáneos (no es radio)
 *
 * Performance:
 *  - max-height transition usa CSS, NO JS — smooth en mobile sin work
 *  - Lazy content: solo renderiza children cuando expanded (opt-in via `lazy` prop)
 */

interface Props {
  /** Lo que siempre se ve (foto, título, badge). Tap acá toggle expansion. */
  header: React.ReactNode;
  /** Lo que aparece al expandir. */
  children: React.ReactNode;
  /** Si true (default), children solo se monta cuando expanded. */
  lazy?: boolean;
  /** Estado inicial. */
  defaultExpanded?: boolean;
  /** Si controlado externamente. */
  expanded?: boolean;
  onToggle?: (expanded: boolean) => void;
  /** Wrapper extra className */
  className?: string;
  /** Hide chevron */
  hideChevron?: boolean;
}

export function InlineAccordion({
  header,
  children,
  lazy = true,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onToggle,
  className = "",
  hideChevron = false,
}: Props) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const expanded = controlledExpanded ?? internalExpanded;
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | "auto">(0);

  const toggle = () => {
    const next = !expanded;
    if (controlledExpanded === undefined) setInternalExpanded(next);
    onToggle?.(next);
  };

  // Mide la altura del contenido para animar max-height
  useEffect(() => {
    if (!expanded) {
      setContentHeight(0);
      return;
    }
    if (!contentRef.current) return;
    // Set to scrollHeight; después de transition, switch a 'auto' para soportar contenido dinámico
    const h = contentRef.current.scrollHeight;
    setContentHeight(h);
    // Después de la animación (300ms), permitir overflow
    const timer = setTimeout(() => setContentHeight("auto"), 320);
    return () => clearTimeout(timer);
  }, [expanded, children]);

  return (
    <div className={`ios-card overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={toggle}
        className="w-full text-left flex items-center justify-between gap-3 pressable"
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">{header}</div>
        {!hideChevron && (
          <ChevronDown
            className={`w-4 h-4 text-muted-foreground shrink-0 mr-3 transition-transform duration-300 ${
              expanded ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        )}
      </button>
      <div
        ref={contentRef}
        style={{
          maxHeight: contentHeight === "auto" ? "none" : `${contentHeight}px`,
          opacity: expanded ? 1 : 0,
          transition: "max-height 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease",
          overflow: contentHeight === "auto" ? "visible" : "hidden",
        }}
        aria-hidden={!expanded}
      >
        {(!lazy || expanded) && (
          <div className="px-4 pb-4 pt-1 border-t border-border/40">{children}</div>
        )}
      </div>
    </div>
  );
}
