"use client";

import React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/helpers";
import { useCountUp } from "@/lib/hooks/use-count-up";

// ─── PRESSABLE — iOS HIG tap primitive ───
//
// Wrapper canónico para cualquier elemento clickable iOS-style. Combina:
//   - `.pressable` (scale 0.97 + opacity 0.92 + transition spring)
//   - focus-visible ring (ya provisto por `:focus-visible` global)
//   - haptic light al click si estamos en native (Capacitor)
//   - prop `compact` para densidad reducida (padding tighter)
//   - prop `disabled` con styling correcto
//
// Por defecto renderiza <button>. Si pasás `href` renderiza <Link>.
// Usa forwardRef para no romper integraciones con refs (popovers, focus mgmt).
type PressableBaseProps = {
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
  disabled?: boolean;
  /** aria-label requerido si los children son solo iconos */
  "aria-label"?: string;
};
type PressableAsButton = PressableBaseProps & {
  href?: undefined;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: "button" | "submit" | "reset";
};
type PressableAsLink = PressableBaseProps & {
  href: string;
  onClick?: undefined;
};
export type PressableProps = PressableAsButton | PressableAsLink;

/** Disparo de haptic light — fire-and-forget, sin top-level Capacitor dep. */
function fireHaptic(): void {
  import("@/lib/native/platform").then(({ haptic }) => haptic("light")).catch(() => {});
}

export const Pressable = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, PressableProps>(
  function Pressable(props, ref) {
    const { children, className, compact, disabled, "aria-label": ariaLabel } = props;
    const base = cn(
      "pressable inline-flex items-center justify-center focus-ring-inline",
      compact ? "text-[13.5px]" : "text-[15px]",
      disabled && "opacity-50 pointer-events-none",
      className
    );
    if ("href" in props && props.href !== undefined) {
      return (
        <Link
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={props.href}
          className={base}
          aria-label={ariaLabel}
          aria-disabled={disabled || undefined}
          onClick={(e) => {
            if (disabled) { e.preventDefault(); return; }
            fireHaptic();
          }}
        >
          {children}
        </Link>
      );
    }
    const { onClick, type = "button" } = props as PressableAsButton;
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type={type}
        className={base}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={(e) => {
          fireHaptic();
          onClick?.(e);
        }}
      >
        {children}
      </button>
    );
  }
);

// ─── LARGE TITLE HEADER (iOS HIG primary pattern) ───
// En mobile (<768px) el `action` se apila DEBAJO del title para que chips múltiples
// (IA/iCal/PDF/Compartir + presence/collab) no se pisen con el title. En md+ vuelve a
// side-by-side. `action` envuelve en flex-wrap por si el caller pasa varios chips.
export function LargeTitle({
  eyebrow, title, serif = false, action,
}: { eyebrow?: string; title: string; serif?: boolean; action?: React.ReactNode }) {
  return (
    <header className="px-5 pt-4 pb-5">
      {eyebrow && (
        <p className="text-[11px] font-semibold tracking-[0.10em] uppercase text-muted-foreground mb-1">
          {eyebrow}
        </p>
      )}
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between md:gap-3">
        <h1 className={cn(serif ? "title-large-serif" : "title-large", "min-w-0")}>{title}</h1>
        {action && <div className="flex flex-wrap gap-1.5 md:shrink-0 md:pb-1 md:justify-end">{action}</div>}
      </div>
    </header>
  );
}

// ─── SECTION (eyebrow + insetted list) ───
export function IOSSection({
  eyebrow, footer, children,
}: { eyebrow?: string; footer?: string; children: React.ReactNode }) {
  return (
    <section className="px-4 mb-8">
      {eyebrow && <p className="ios-eyebrow">{eyebrow}</p>}
      <div className="ios-list">{children}</div>
      {footer && <p className="px-4 pt-2 text-[11px] text-muted-foreground leading-relaxed">{footer}</p>}
    </section>
  );
}

// ─── ROW (Things 3 / iOS Settings row) ───
// `compact` reduce tipografía e icono para listas densas tipo /alerts (menos fatiga visual
// cuando la severity ya está expresada por el icono + sección).
export function IOSRow({
  icon, iconBg, title, subtitle, value, href, onClick, chevron, accent, compact,
}: {
  icon?: React.ReactNode;
  iconBg?: string;
  title: string;
  subtitle?: string;
  value?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  chevron?: boolean;
  accent?: string;
  compact?: boolean;
}) {
  const Content = (
    <div className={cn("ios-list-row pressable", compact && "py-2")}>
      {icon && (
        <span
          aria-hidden="true"
          className={cn(
            "rounded-[var(--radius-sm)] flex items-center justify-center shrink-0",
            compact ? "w-7 h-7" : "w-8 h-8",
            iconBg ?? "bg-accent text-foreground"
          )}
          style={accent ? { background: accent, color: "white" } : undefined}
        >
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn(
          "font-medium leading-tight truncate",
          compact ? "text-[13.5px]" : "text-[15px]"
        )}>{title}</p>
        {subtitle && (
          <p className={cn(
            "text-muted-foreground truncate",
            compact ? "text-[11px] mt-0.5" : "text-[12px] mt-0.5"
          )}>{subtitle}</p>
        )}
      </div>
      {value && <span className={cn(
        "text-muted-foreground tabular-nums shrink-0",
        compact ? "text-[12px]" : "text-[14px]"
      )}>{value}</span>}
      {chevron && <span className="chevron-right" aria-hidden="true" />}
    </div>
  );
  if (href) return <Link href={href} className="focus-ring-inline">{Content}</Link>;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={() => {
          import("@/lib/native/platform").then(({ haptic }) => haptic("light")).catch(() => {});
          onClick();
        }}
        className="w-full text-left focus-ring-inline"
      >
        {Content}
      </button>
    );
  }
  return Content;
}

// ─── FEATURE CARD (hero block with optional gradient) ───
export function IOSFeatureCard({
  children, gradient, className, padding = "lg",
}: {
  children: React.ReactNode;
  gradient?: string;
  className?: string;
  padding?: "md" | "lg" | "xl";
}) {
  return (
    <div
      className={cn("ios-card-feature relative overflow-hidden", className,
        padding === "md" ? "p-5" : padding === "xl" ? "p-7 sm:p-8" : "p-6")}
      style={gradient ? { background: gradient } : undefined}
    >
      {children}
    </div>
  );
}

// ─── STAT CHIP (compact metric, not a card) ───
export function StatChip({
  label, value, status,
}: { label: string; value: string | number; status?: "ok" | "warn" | "alert" | "neutral" }) {
  const tint = status === "ok" ? "text-success" : status === "warn" ? "text-warning" :
               status === "alert" ? "text-destructive" : "text-foreground";
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-bold tabular-nums leading-none", tint)}>{value}</p>
    </div>
  );
}

// ─── PILL (status / category) ───
export function Pill({
  children, tone = "neutral", className,
}: { children: React.ReactNode; tone?: "neutral" | "primary" | "ok" | "warn" | "alert"; className?: string }) {
  const tones = {
    neutral: "bg-muted text-muted-foreground",
    primary: "bg-primary/15 text-primary",
    ok: "tampu-icon tampu-icon-cardon",
    warn: "tampu-icon tampu-icon-mostaza",
    alert: "tampu-icon tampu-icon-carmin",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold focus-ring-inline", tones[tone], className)}>
      {children}
    </span>
  );
}

// ─── PROGRESS RING (Apple Fitness inspired) ───
//
// Anima desde 0 hasta `value` al montar con ease-out cubic. El número adentro
// también cuenta. Re-monta cuando value cambia.
export function ProgressRing({
  value, size = 96, stroke = 6, accent,
}: { value: number; size?: number; stroke?: number; accent?: string }) {
  const animated = useCountUp(value, { durationMs: 1100 });
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - Math.min(100, Math.max(0, animated)) / 100 * c;
  const color = accent ?? (animated >= 80 ? "#10b981" : animated >= 50 ? "#f59e0b" : "#ef4444");
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={stroke} className="opacity-15" stroke="currentColor" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={stroke} stroke={color}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 60ms linear" }} />
      </svg>
      <span className="absolute font-serif text-3xl tabular-nums">{Math.round(animated)}</span>
    </div>
  );
}

// ─── BOTTOM SHEET (modal w/ drag handle + velocity dismiss, iOS) ───
//
// Drag handle responde a touch: si arrastrás hacia abajo más de 100px O
// velocity > 0.5 px/ms, se cierra. Backdrop fade es proporcional al drag.
// El haptic es discreto en el grab y medium en el dismiss confirm.
//
// Touch flow:
//   onTouchStart  → captura startY, startT, haptic light
//   onTouchMove   → setea translateY si drag down (no permitimos drag up)
//                   + reduce backdrop opacity proporcional
//   onTouchEnd    → calcula velocity = (lastY - startY) / (lastT - startT)
//                   si drag > threshold || velocity > 0.5 → onClose
//                   sino → spring back a 0
export function Sheet({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const dragState = React.useRef<{ startY: number; startT: number; lastY: number; lastT: number; dragging: boolean }>({
    startY: 0, startT: 0, lastY: 0, lastT: 0, dragging: false,
  });
  const [dragY, setDragY] = React.useState(0);

  // Reset drag state when re-opening
  React.useEffect(() => {
    if (open) setDragY(0);
  }, [open]);

  // Escape key handler — close sheet on keypress when open (a11y).
  React.useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    dragState.current = { startY: t.clientY, startT: Date.now(), lastY: t.clientY, lastT: Date.now(), dragging: true };
    // Light haptic on grab (lazy import — no top-level dep on Capacitor)
    import("@/lib/native/platform").then(({ haptic }) => haptic("light")).catch(() => {});
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragState.current.dragging) return;
    const t = e.touches[0];
    const dy = Math.max(0, t.clientY - dragState.current.startY);
    dragState.current.lastY = t.clientY;
    dragState.current.lastT = Date.now();
    setDragY(dy);
  };
  const onTouchEnd = () => {
    if (!dragState.current.dragging) return;
    const { startY, startT, lastY, lastT } = dragState.current;
    const dy = lastY - startY;
    const dt = Math.max(1, lastT - startT);
    const velocity = dy / dt; // px/ms
    dragState.current.dragging = false;

    if (dy > 110 || velocity > 0.5) {
      import("@/lib/native/platform").then(({ haptic }) => haptic("medium")).catch(() => {});
      onClose();
    } else {
      // Spring back to 0
      setDragY(0);
    }
  };

  if (!open) return null;
  const backdropOpacity = Math.max(0.15, 0.5 - dragY * 0.002);
  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 backdrop-blur-sm transition-opacity duration-[120ms]"
        style={{ backgroundColor: `rgba(0,0,0,${backdropOpacity})` }}
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        className="absolute left-0 right-0 bottom-0 ios-material rounded-t-[var(--radius-lg)] shadow-[var(--shadow-sheet)] safe-area-bottom"
        style={{
          maxHeight: "85vh",
          transform: `translateY(${dragY}px)`,
          transition: dragState.current.dragging
            ? "none"
            : "transform 0.42s cubic-bezier(0.34, 1.56, 0.64, 1)",
          animation: dragY === 0 && !dragState.current.dragging ? "slide-up 0.4s var(--ease-ios)" : undefined,
          willChange: "transform",
        }}
      >
        {/* Drag handle — area expandida para touch facil */}
        <div
          className="flex justify-center pt-2.5 pb-2 cursor-grab active:cursor-grabbing"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <span className="w-10 h-1 rounded-full bg-muted-foreground/45 transition-colors" aria-hidden />
        </div>
        {title && (
          <div className="px-5 pb-3 border-b border-border/60">
            <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          </div>
        )}
        <div className="overflow-y-auto px-5 py-4" style={{ maxHeight: "calc(85vh - 80px)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── WALLET CARD — Apple Wallet pass, vertical stack ready ───
export function WalletCard({
  title, subtitle, badge, gradient, icon, href, onClick, footer, status,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  gradient?: string;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  footer?: React.ReactNode;
  status?: "ok" | "warn" | "alert";
}) {
  const statusDot = status && (
    <span
      className={cn("w-2 h-2 rounded-full",
        status === "ok" ? "bg-success" : status === "warn" ? "bg-warning" : "bg-destructive")}
      style={{ boxShadow: `0 0 10px currentColor` }}
    />
  );
  const Body = (
    <div
      className="pressable relative overflow-hidden rounded-[var(--radius)] p-6 text-white focus-ring-inline"
      style={{
        background: gradient ?? "linear-gradient(140deg, #0f172a 0%, #1e3a8a 60%, #2563eb 100%)",
        minHeight: 192,
        boxShadow: "0 1px 0 rgba(255,255,255,0.08) inset, 0 16px 32px rgba(0,0,0,0.20), 0 4px 12px rgba(0,0,0,0.12)",
      }}
    >
      {/* Subtle radial highlight — gives the pass that "embossed" feel */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 80% 0%, rgba(255,255,255,0.15), transparent 50%)",
        }}
        aria-hidden
      />
      {/* Hairline at top — like real passes */}
      <div className="absolute top-0 left-0 right-0 h-px bg-white/20" aria-hidden />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {badge && (
            <p className="text-[10px] font-bold tracking-[0.20em] uppercase text-white/65 mb-3">
              {badge}
            </p>
          )}
          <h3 className="font-serif text-[26px] leading-[1.1] line-clamp-2 break-words">{title}</h3>
          {subtitle && <p className="text-[13px] text-white/70 mt-2 line-clamp-1">{subtitle}</p>}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {statusDot}
          {icon && (
            <span className="w-9 h-9 rounded-xl bg-white/12 flex items-center justify-center backdrop-blur-sm">
              <span className="opacity-90">{icon}</span>
            </span>
          )}
        </div>
      </div>

      {/* Footer area — like pass barcode area */}
      {footer && (
        <div className="relative mt-6 pt-4 border-t border-white/15 flex items-center justify-between gap-2 text-[11px] text-white/75 font-medium tracking-wide">
          <span>{footer}</span>
          <span className="text-[10px] tracking-widest opacity-70">TAP</span>
        </div>
      )}
    </div>
  );
  if (href) return <Link href={href} className="block">{Body}</Link>;
  if (onClick) return <button onClick={onClick} className="block w-full text-left">{Body}</button>;
  return Body;
}
