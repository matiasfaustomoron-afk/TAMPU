"use client";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/shared";
import { useSupabase } from "@/lib/context/supabase-provider";
import { useI18n } from "@/i18n/provider";
import { LOCALE_LABELS } from "@/i18n/config";
import { User, LogOut, Globe, Clock, CreditCard } from "lucide-react";
export default function ProfilePage() {
  const { t, locale } = useI18n();
  const { user, mode, client } = useSupabase();
  const router = useRouter();
  const handleLogout = async () => { if (client) await client.auth.signOut(); router.push("/login"); router.refresh(); };
  return (
    <div className="space-y-6 pb-20 lg:pb-0 animate-fade-in">
      <SectionHeader title={t.profile.title} subtitle={t.profile.subtitle} />
      <Card><CardHeader><CardTitle>{t.profile.account}</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex items-center gap-4"><div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center"><User className="w-7 h-7 text-primary" /></div><div><p className="font-semibold">{user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Demo User"}</p><p className="text-sm text-muted-foreground">{user?.email || "demo@travel-os.local"}</p><p className="text-xs text-muted-foreground mt-0.5">{mode === "online" ? <span className="text-success">{t.profile.connectedToSupabase}</span> : <span className="text-warning">{t.profile.demoModeLocal}</span>}</p></div></div></CardContent></Card>
      <Card><CardHeader><CardTitle>{t.profile.preferences}</CardTitle></CardHeader><CardContent><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30"><Clock className="w-4 h-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">{t.profile.timezone}</p><p className="text-sm font-medium">America/Argentina/Buenos_Aires</p></div></div><div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30"><CreditCard className="w-4 h-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">{t.expenses.currency}</p><p className="text-sm font-medium">USD</p></div></div><div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30"><Globe className="w-4 h-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">{t.settings.language}</p><p className="text-sm font-medium">{LOCALE_LABELS[locale]}</p></div></div></div></CardContent></Card>
      <Card><CardContent className="p-4"><Button variant="outline" onClick={handleLogout} className="w-full gap-2"><LogOut className="w-4 h-4" />{t.auth.signOut}</Button></CardContent></Card>
    </div>
  );
}
