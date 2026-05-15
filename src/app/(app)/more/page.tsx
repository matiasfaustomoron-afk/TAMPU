"use client";

import { LargeTitle, IOSSection, IOSRow } from "@/components/ios";
import { PinnedViewsManager } from "@/components/ios/pin-toggle";
import { UsageStats } from "@/components/ios/usage-stats";
import { DataStatusCard } from "@/components/ios/data-status-card";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useI18n } from "@/i18n/provider";
import {
  Sparkles, MapPin, Bookmark, CheckSquare,
  PieChart, TrendingUp, Users,
  Stamp, Package, Heart,
  ShieldAlert, Bell,
  Inbox, Settings, User,
  Globe, Camera, Vote, Clock,
  MessageCircle, Mail, Lock,
} from "lucide-react";

export default function MorePage() {
  const { t } = useI18n();
  const m = t.more;
  return (
    <div className="animate-fade-in">
      <LargeTitle title={m.title} eyebrow={m.subtitle} />

      {/* Pinned views — let the user customize Today */}
      <section className="px-4 mb-6">
        <p className="ios-eyebrow">{m.personalizeToday}</p>
        <PinnedViewsManager />
      </section>

      {/* Asistente — destacado arriba */}
      <IOSSection eyebrow={m.sections.asistente}>
        <IOSRow
          icon={<Sparkles className="w-4 h-4" />}
          iconBg="tampu-gradient-warm text-white"
          title={m.items.asistenteIA}
          subtitle={m.items.asistenteIASub}
          href="/assistant"
          chevron
        />
      </IOSSection>

      <IOSSection eyebrow={m.sections.diario}>
        <IOSRow icon={<Camera className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-canela"
          title={m.items.fotos} subtitle={m.items.fotosSub} href="/journal" chevron />
      </IOSSection>

      {/* Planning fue absorbido por la tab "Viaje" (mayo 2026 restructure):
          /trips, /map, /reservations, /tasks, /visas, /packing, /health ahora viven
          como sub-vistas dentro de /itinerary. /calendar fue eliminada (duplicaba Today).
          Mantenemos accesos directos acá para deep-link / hábito legacy. */}
      <IOSSection eyebrow={m.sections.viaje}>
        <IOSRow icon={<Globe className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-cobre"
          title={m.items.cambiarViaje} subtitle={m.items.cambiarViajeSub} href="/trips" chevron />
        <IOSRow icon={<Users className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-canela"
          title={m.items.compartirViaje} subtitle={m.items.compartirViajeSub} href="/members" chevron />
        <IOSRow icon={<MapPin className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-cardon"
          title={m.items.mapa} subtitle={m.items.mapaSub} href="/map" chevron />
        <IOSRow icon={<Bookmark className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-mostaza"
          title={m.items.reservas} subtitle={m.items.reservasSub} href="/reservations" chevron />
        <IOSRow icon={<CheckSquare className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-terracota"
          title={m.items.tareas} subtitle={m.items.tareasSub} href="/tasks" chevron />
      </IOSSection>

      {/* Colaboración: polls + activity reciente */}
      <IOSSection eyebrow={m.sections.colaborar}>
        <IOSRow icon={<Vote className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-mostaza"
          title={m.items.encuestas} subtitle={m.items.encuestasSub} href="/polls" chevron />
        <IOSRow icon={<Clock className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-piedra"
          title={m.items.actividad} subtitle={m.items.actividadSub} href="/trips?activity=1" chevron />
      </IOSSection>

      <IOSSection eyebrow={m.sections.dinero}>
        <IOSRow icon={<PieChart className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-cardon"
          title={m.items.presupuesto} subtitle={m.items.presupuestoSub} href="/budget" chevron />
        <IOSRow icon={<TrendingUp className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-mostaza"
          title={m.items.movimiento} subtitle={m.items.movimientoSub} href="/cashflow" chevron />
        <IOSRow icon={<Users className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-canela"
          title={m.items.compartido} subtitle={m.items.compartidoSub} href="/split" chevron />
      </IOSSection>

      <IOSSection eyebrow={m.sections.documentos}>
        <IOSRow icon={<Stamp className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-cobre"
          title={m.items.visas} subtitle={m.items.visasSub} href="/visas" chevron />
        <IOSRow icon={<Heart className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-carmin"
          title={m.items.salud} subtitle={m.items.saludSub} href="/health" chevron />
        <IOSRow icon={<Package className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-terracota"
          title={m.items.equipaje} subtitle={m.items.equipajeSub} href="/packing" chevron />
      </IOSSection>

      <IOSSection eyebrow={m.sections.antesDurante}>
        <IOSRow icon={<Inbox className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-indigo"
          title={m.items.importar} subtitle={m.items.importarSub} href="/import" chevron />
        <IOSRow icon={<ShieldAlert className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-carmin"
          title={m.items.sos} subtitle={m.items.sosSub} href="/emergency" chevron />
        <IOSRow icon={<Bell className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-mostaza"
          title={m.items.alertas} subtitle={m.items.alertasSub} href="/alerts" chevron />
      </IOSSection>

      {/* Ingest channels — accesos directos a las páginas que antes vivían
          ocultas detrás de /settings. Útil para deep-link y descubrimiento. */}
      <IOSSection eyebrow={m.sections.canales}>
        <IOSRow icon={<MessageCircle className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-cobre"
          title={m.items.whatsapp} subtitle={m.items.whatsappSub} href="/whatsapp" chevron />
        <IOSRow icon={<Mail className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-mostaza"
          title={m.items.inbox} subtitle={m.items.inboxSub} href="/inbox" chevron />
        <IOSRow icon={<Lock className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-piedra"
          title={m.items.passcode} subtitle={m.items.passcodeSub} href="/passcode" chevron />
      </IOSSection>

      {/* "Panel completo" (/dashboard) y "Resumen imprimible" (/book) fueron eliminados
          en el restructure de mayo 2026: duplicaban Today (dashboard) y eran feature edge (book). */}

      <IOSSection eyebrow={m.sections.cuenta}>
        <IOSRow icon={<User className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-piedra"
          title={m.items.perfil} href="/profile" chevron />
        <IOSRow icon={<Settings className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-piedra"
          title={m.items.ajustes} subtitle={m.items.ajustesSub} href="/settings" chevron />
      </IOSSection>

      {/* Trust + backup — visible donde el usuario suele perderse */}
      <section className="px-4 mb-6">
        <p className="ios-eyebrow">{m.yourData}</p>
        <DataStatusCard />
      </section>

      <section className="px-4 mb-6">
        <p className="ios-eyebrow">{m.theme}</p>
        <div className="ios-card p-4 flex items-center justify-between">
          <span className="text-[14px] text-muted-foreground">{m.appearance}</span>
          <ThemeToggle />
        </div>
      </section>

      <section className="px-4 mb-8">
        <p className="ios-eyebrow">{m.activity}</p>
        <UsageStats />
      </section>

      <p className="text-center text-[11px] text-muted-foreground/60 pt-2 pb-8">
        {m.versionTagline}
      </p>
    </div>
  );
}
