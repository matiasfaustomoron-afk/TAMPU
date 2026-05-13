"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPinnedViews, PINNABLE } from "@/lib/pinned-views";
import { Heart, Stamp, Package, ShieldAlert, FolderClosed, CheckSquare, Calendar, Users, Bell } from "lucide-react";
import { cn } from "@/lib/utils/helpers";

const ICONS: Record<string, { icon: typeof Heart; tint: string }> = {
  health:    { icon: Heart,        tint: "tampu-icon tampu-icon-carmin" },
  visas:     { icon: Stamp,        tint: "tampu-icon tampu-icon-canela" },
  packing:   { icon: Package,      tint: "tampu-icon tampu-icon-cobre" },
  emergency: { icon: ShieldAlert,  tint: "tampu-icon tampu-icon-carmin" },
  vault:     { icon: FolderClosed, tint: "tampu-icon tampu-icon-indigo" },
  tasks:     { icon: CheckSquare,  tint: "tampu-icon tampu-icon-indigo" },
  calendar:  { icon: Calendar,     tint: "tampu-icon tampu-icon-indigo" },
  split:     { icon: Users,        tint: "tampu-icon tampu-icon-canela" },
  alerts:    { icon: Bell,         tint: "tampu-icon tampu-icon-mostaza" },
};

export function PinnedShortcuts() {
  const [pinned, setPinned] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setPinned(getPinnedViews());
    sync();
    window.addEventListener("travel-os-pinned-change", sync);
    return () => window.removeEventListener("travel-os-pinned-change", sync);
  }, []);

  if (pinned.length === 0) return null;

  const items = pinned
    .map(k => PINNABLE.find(p => p.key === k))
    .filter((p): p is typeof PINNABLE[number] => !!p);

  return (
    <section className="px-4 mt-8">
      <p className="ios-eyebrow">Tus vistas</p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {items.map(m => {
          const meta = ICONS[m.key];
          const Icon = meta?.icon || Heart;
          return (
            <Link
              key={m.key}
              href={m.href}
              className="pressable ios-card p-3 flex flex-col items-center justify-center gap-1.5 text-center min-h-[88px]"
            >
              <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", meta?.tint || "bg-muted")}>
                <Icon className="w-5 h-5" strokeWidth={2.2} />
              </span>
              <span className="text-[11.5px] font-semibold leading-tight">{m.label}</span>
            </Link>
          );
        })}
      </div>
      <p className="text-[10.5px] text-muted-foreground mt-2 text-center">
        Configurá tus vistas en Más → Personalizar Hoy
      </p>
    </section>
  );
}
