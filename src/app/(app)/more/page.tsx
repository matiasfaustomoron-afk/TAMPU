"use client";

import { LargeTitle, IOSSection, IOSRow } from "@/components/ios";
import { PinnedViewsManager } from "@/components/ios/pin-toggle";
import { UsageStats } from "@/components/ios/usage-stats";
import { DataStatusCard } from "@/components/ios/data-status-card";
import { ThemeToggle } from "@/components/layout/theme-toggle";
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
  return (
    <div className="animate-fade-in">
      <LargeTitle title="Más" eyebrow="Todas las herramientas" />

      {/* Pinned views — let the user customize Today */}
      <section className="px-4 mb-6">
        <p className="ios-eyebrow">Personalizar Hoy</p>
        <PinnedViewsManager />
      </section>

      {/* Asistente — destacado arriba */}
      <IOSSection eyebrow="Asistente">
        <IOSRow
          icon={<Sparkles className="w-4 h-4" />}
          iconBg="tampu-gradient-warm text-white"
          title="Asistente IA"
          subtitle="Preguntale lo que sea sobre tu viaje"
          href="/assistant"
          chevron
        />
      </IOSSection>

      <IOSSection eyebrow="Diario">
        <IOSRow icon={<Camera className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-canela"
          title="Fotos del viaje" subtitle="Capturá momentos · offline · con geotag" href="/journal" chevron />
      </IOSSection>

      {/* Planning fue absorbido por la tab "Viaje" (mayo 2026 restructure):
          /trips, /map, /reservations, /tasks, /visas, /packing, /health ahora viven
          como sub-vistas dentro de /itinerary. /calendar fue eliminada (duplicaba Today).
          Mantenemos accesos directos acá para deep-link / hábito legacy. */}
      <IOSSection eyebrow="Viaje">
        <IOSRow icon={<Globe className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-cobre"
          title="Cambiar de viaje" subtitle="Ver todos / crear nuevo" href="/trips" chevron />
        <IOSRow icon={<Users className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-canela"
          title="Compartir viaje" subtitle="Invitar compañeros · roles" href="/members" chevron />
        <IOSRow icon={<MapPin className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-cardon"
          title="Mapa" subtitle="Ruta y POIs" href="/map" chevron />
        <IOSRow icon={<Bookmark className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-mostaza"
          title="Reservas" subtitle="Tours, seguros, traslados" href="/reservations" chevron />
        <IOSRow icon={<CheckSquare className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-terracota"
          title="Tareas" subtitle="Pendientes del viaje" href="/tasks" chevron />
      </IOSSection>

      {/* Colaboración: polls + activity reciente */}
      <IOSSection eyebrow="Colaborar">
        <IOSRow icon={<Vote className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-mostaza"
          title="Encuestas" subtitle="Decidí con el grupo · A vs B vs C" href="/polls" chevron />
        <IOSRow icon={<Clock className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-piedra"
          title="Actividad reciente" subtitle="Qué cambió en el viaje" href="/trips?activity=1" chevron />
      </IOSSection>

      <IOSSection eyebrow="Dinero">
        <IOSRow icon={<PieChart className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-cardon"
          title="Presupuesto" subtitle="Plan vs real" href="/budget" chevron />
        <IOSRow icon={<TrendingUp className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-mostaza"
          title="Movimiento" subtitle="Cuándo gastás" href="/cashflow" chevron />
        <IOSRow icon={<Users className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-canela"
          title="Compartido" subtitle="Quién paga qué" href="/split" chevron />
      </IOSSection>

      <IOSSection eyebrow="Documentos">
        <IOSRow icon={<Stamp className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-cobre"
          title="Visas" subtitle="Requisitos por destino" href="/visas" chevron />
        <IOSRow icon={<Heart className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-carmin"
          title="Salud" subtitle="Vacunas y certificados" href="/health" chevron />
        <IOSRow icon={<Package className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-terracota"
          title="Equipaje" subtitle="Qué llevar" href="/packing" chevron />
      </IOSSection>

      <IOSSection eyebrow="Antes & durante">
        <IOSRow icon={<Inbox className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-indigo"
          title="Importar" subtitle="Pegá emails de confirmación" href="/import" chevron />
        <IOSRow icon={<ShieldAlert className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-carmin"
          title="SOS" subtitle="Emergencia por país" href="/emergency" chevron />
        <IOSRow icon={<Bell className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-mostaza"
          title="Alertas" subtitle="Activas hoy" href="/alerts" chevron />
      </IOSSection>

      {/* Ingest channels — accesos directos a las páginas que antes vivían
          ocultas detrás de /settings. Útil para deep-link y descubrimiento. */}
      <IOSSection eyebrow="Canales de ingesta">
        <IOSRow icon={<MessageCircle className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-cobre"
          title="WhatsApp" subtitle="Mensajes parseados · vincular número" href="/whatsapp" chevron />
        <IOSRow icon={<Mail className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-mostaza"
          title="Inbox" subtitle="Reenviá emails a Tampu" href="/inbox" chevron />
        <IOSRow icon={<Lock className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-piedra"
          title="Passcode" subtitle="Cifrado at-rest de tus Documentos" href="/passcode" chevron />
      </IOSSection>

      {/* "Panel completo" (/dashboard) y "Resumen imprimible" (/book) fueron eliminados
          en el restructure de mayo 2026: duplicaban Today (dashboard) y eran feature edge (book). */}

      <IOSSection eyebrow="Cuenta">
        <IOSRow icon={<User className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-piedra"
          title="Perfil" href="/profile" chevron />
        <IOSRow icon={<Settings className="w-4 h-4" />} iconBg="tampu-icon tampu-icon-piedra"
          title="Ajustes" subtitle="Idioma, API key, mapa, tracking" href="/settings" chevron />
      </IOSSection>

      {/* Trust + backup — visible donde el usuario suele perderse */}
      <section className="px-4 mb-6">
        <p className="ios-eyebrow">Tus datos</p>
        <DataStatusCard />
      </section>

      <section className="px-4 mb-6">
        <p className="ios-eyebrow">Tema</p>
        <div className="ios-card p-4 flex items-center justify-between">
          <span className="text-[14px] text-muted-foreground">Apariencia</span>
          <ThemeToggle />
        </div>
      </section>

      <section className="px-4 mb-8">
        <p className="ios-eyebrow">Actividad</p>
        <UsageStats />
      </section>

      <p className="text-center text-[11px] text-muted-foreground/60 pt-2 pb-8">
        Tampu · v1.0 · La posta del viajero
      </p>
    </div>
  );
}
