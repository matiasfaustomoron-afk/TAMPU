"use client";

export const dynamic = "force-dynamic";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Compass, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isSupabaseConfigured, createClient } from "@/lib/supabase/client";
import { useI18n } from "@/i18n/provider";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";

const isDemoEnabled = process.env.NEXT_PUBLIC_ENABLE_DEMO_MODE === "true";

function LoginForm() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/today";
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  // Cuando el signup requiere email confirmation, NO hay session — mostramos
  // pantalla "revisá tu mail" en vez de intentar push a /today (que rebota a /login).
  const [signupSent, setSignupSent] = useState<string | null>(null);

  const handleAuth = async () => {
    if (!email || !password) { setError(t.auth.emailRequired); return; }
    setLoading(true); setError(null);
    const sb = createClient();
    if (!sb) { setError("Supabase not configured"); setLoading(false); return; }

    if (mode === "login") {
      const { data, error: ae } = await sb.auth.signInWithPassword({ email, password });
      if (ae) { setError(ae.message); setLoading(false); return; }
      if (!data?.session) {
        setError("Login OK pero no se creó sesión — probablemente tu email no está confirmado todavía");
        setLoading(false);
        return;
      }
      // CRÍTICO: full page reload (no router.push) para que el middleware
      // server-side vea las cookies recién seteadas por @supabase/ssr.
      // router.push tiene race condition con la propagación de document.cookie.
      window.location.href = next;
      return;
    }

    // Signup
    const { data, error: ae } = await sb.auth.signUp({
      email,
      password,
      options: {
        // Redirect explícito post-confirmation al deploy actual (no localhost).
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` : undefined,
      },
    });
    if (ae) { setError(ae.message); setLoading(false); return; }

    if (data?.session) {
      // Email confirmation está deshabilitado en Supabase → session inmediata → ir al app
      // window.location.href forces full reload — necesario para que middleware vea cookies.
      window.location.href = next;
    } else {
      // Email confirmation activado → user tiene que clickear link del mail
      setSignupSent(email);
      setLoading(false);
    }
  };
  const handleDemo = () => { setLoading(true); router.push("/today"); };

  if (signupSent) {
    return (
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Compass className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold">{t.common.appName}</h1>
          </div>
        </div>
        <div className="p-6 rounded-lg border border-primary/30 bg-primary/5 space-y-3 text-center">
          <h2 className="font-semibold">Revisá tu mail</h2>
          <p className="text-sm text-muted-foreground">Te mandamos un link a <strong>{signupSent}</strong>. Clickeá ahí para confirmar y entrar a Tampu.</p>
          <p className="text-xs text-muted-foreground">Si no te llega en unos minutos, revisá spam.</p>
          <button onClick={() => { setSignupSent(null); setMode("login"); }} className="text-xs text-primary underline mt-2">Usar otro mail</button>
        </div>
      </div>
    );
  }

  if (!isSupabaseConfigured && !isDemoEnabled) {
    return (<div className="w-full max-w-sm space-y-6"><div className="text-center"><div className="flex items-center justify-center gap-3 mb-6"><Compass className="w-8 h-8 text-primary" /><h1 className="text-2xl font-bold">{t.common.appName}</h1></div></div><div className="p-6 rounded-lg border border-destructive/30 bg-destructive/5 space-y-3"><div className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-5 h-5" /><span className="font-semibold">{t.auth.notConfigured}</span></div><p className="text-sm text-muted-foreground">{t.auth.notConfiguredDesc}</p></div></div>);
  }

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-4"><Compass className="w-8 h-8 text-primary" /><h1 className="text-2xl font-bold">{t.common.appName}</h1></div>
        <p className="text-sm text-muted-foreground mb-4">{t.auth.subtitle}</p>
        <div className="flex justify-center gap-1">{LOCALES.map(l => <button key={l} onClick={() => setLocale(l)} className={`px-2.5 py-1 rounded text-xs font-medium ${locale === l ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{LOCALE_LABELS[l]}</button>)}</div>
      </div>
      {isSupabaseConfigured && (<div className="space-y-4"><div><label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t.auth.email}</label><Input type="email" placeholder="your@email.com" className="mt-1" value={email} onChange={e => setEmail(e.target.value)} /></div><div><label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t.auth.password}</label><Input type="password" placeholder="••••••••" className="mt-1" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAuth()} /></div>{error && <p className="text-xs text-destructive">{error}</p>}<Button className="w-full" onClick={handleAuth} disabled={loading}>{loading ? t.common.loading : mode === "login" ? t.auth.signIn : t.auth.signUp}</Button><p className="text-xs text-center text-muted-foreground">{mode === "login" ? t.auth.noAccount : t.auth.hasAccount} <button onClick={() => setMode(mode === "login" ? "signup" : "login")} className="text-primary underline">{mode === "login" ? t.auth.signUp : t.auth.signIn}</button></p></div>)}
      {isDemoEnabled && (<>{isSupabaseConfigured && <div className="relative"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">{t.auth.or}</span></div></div>}<Button onClick={handleDemo} variant={isSupabaseConfigured ? "outline" : "default"} className="w-full" disabled={loading}>{loading ? t.common.loading : t.auth.enterDemo}</Button><p className="text-[10px] text-center text-muted-foreground">{t.auth.demoNote}</p></>)}
    </div>
  );
}

export default function LoginPage() {
  return (<div className="min-h-screen flex items-center justify-center p-4 bg-background"><Suspense fallback={<div className="text-muted-foreground">Cargando...</div>}><LoginForm /></Suspense></div>);
}
