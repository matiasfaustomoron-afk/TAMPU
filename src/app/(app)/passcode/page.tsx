"use client";

export const dynamic = "force-dynamic";

/**
 * /passcode — flow dedicado de setup / unlock del passcode de cifrado.
 *
 * Tres modos según estado:
 *   1. Setup: no hay passcode. Pedimos crear uno (con confirmación + barra de fuerza).
 *   2. Unlock: hay passcode, app bloqueada. Pedimos el passcode + countdown si lockout.
 *   3. Manage: hay passcode, app desbloqueada. Mostramos status + opciones.
 *   4. Wiped: el vault fue borrado por 10 intentos fallidos.
 *
 * Después de un setup/unlock exitoso, redirigimos a la URL `?next=...` si
 * existe, o a /settings por default.
 *
 * Coordinación con Agent A: si en algún momento aparece un `<Turnstile />`
 * importado, no lo tocamos — sólo refactoreamos la lógica de passcode (validación,
 * lockout, UI de fuerza).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Shield, KeyRound, AlertTriangle, Check, Unlock, Trash2 } from "lucide-react";
import {
  hasPasscode,
  isUnlocked,
  setupPasscode,
  unlockWithPasscode,
  lock,
  forgetPasscode,
  onLockChange,
  validatePasscodeStrength,
  recordFailedAttempt,
  resetFailedAttempts,
  getLockoutState,
  type PasscodeStrength,
  type LockoutState,
} from "@/lib/crypto/passcode";
import { unlockApiKey, migrateLegacyApiKey, hasLegacyPlainApiKey } from "@/lib/ai/user-key";
import { toast } from "@/components/ios/toast";
import { Turnstile } from "@/components/security/turnstile";
import { verifyTurnstileToken } from "@/lib/security/verify-turnstile";

type Mode = "loading" | "setup" | "unlock" | "manage" | "wiped";

function formatRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} segundo${s === 1 ? "" : "s"}`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r === 0 ? `${m} minuto${m === 1 ? "" : "s"}` : `${m} min ${r} s`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export default function PasscodePage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/settings";

  const [mode, setMode] = useState<Mode>("loading");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Strength (setup mode).
  const [strength, setStrength] = useState<PasscodeStrength | null>(null);
  const strengthSeqRef = useRef(0);

  // ─── Turnstile (setup mode only) ─── sprint seguridad 05/2026
  // El widget anti-bot. NO bloqueamos unlock/manage/wiped — sólo setup.
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // Lockout (unlock mode).
  const [lockout, setLockout] = useState<LockoutState>(() =>
    typeof window === "undefined"
      ? { locked: false, remainingMs: 0, attemptsLeft: 10, wiped: false, count: 0 }
      : getLockoutState(),
  );

  // Determinar el modo inicial según el estado.
  const refreshMode = useCallback(async () => {
    const ls = getLockoutState();
    if (ls.wiped) { setMode("wiped"); return; }
    const has = await hasPasscode();
    if (!has) { setMode("setup"); return; }
    setMode(isUnlocked() ? "manage" : "unlock");
  }, []);

  useEffect(() => {
    void refreshMode();
    const off = onLockChange(() => void refreshMode());
    return off;
  }, [refreshMode]);

  // Countdown ticker — sólo activo en unlock mode con lockout vivo.
  useEffect(() => {
    if (mode !== "unlock") return;
    const tick = () => setLockout(getLockoutState());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [mode]);

  // Strength check debounced — corre en cada cambio del pin en setup mode.
  useEffect(() => {
    if (mode !== "setup") { setStrength(null); return; }
    if (!pin) { setStrength(null); return; }
    const seq = ++strengthSeqRef.current;
    const id = setTimeout(async () => {
      try {
        const s = await validatePasscodeStrength(pin);
        // Evitar race condition: sólo aplicar si es el último request.
        if (seq === strengthSeqRef.current) setStrength(s);
      } catch (err) {
        console.error("[passcode-ui] strength check failed", err);
      }
    }, 200);
    return () => clearTimeout(id);
  }, [pin, mode]);

  const handleSetup = async () => {
    setError(null);
    if (!strength?.ok) {
      setError(strength?.reason || "Passcode muy débil. Probá una passphrase de 4 palabras.");
      return;
    }
    if (pin !== pinConfirm) { setError("Los passcodes no coinciden."); return; }
    // Anti-bot: verificar Turnstile antes de aceptar el setup
    const captcha = await verifyTurnstileToken(turnstileToken);
    if (!captcha.ok) {
      setError("No pudimos verificar que sos humano. Reintentá el captcha.");
      return;
    }
    setBusy(true);
    try {
      await setupPasscode(pin);
      // Migrar la API key plain si existía.
      if (hasLegacyPlainApiKey()) {
        const r = await migrateLegacyApiKey();
        if (r.migrated) toast("API key migrada a cifrado", "success");
      }
      toast("Passcode configurado · tus datos ahora están cifrados", "success");
      router.push(next);
    } catch (err) {
      setError((err as Error).message || "No se pudo configurar el passcode");
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async () => {
    setError(null);
    // Re-chequear lockout justo antes de intentar (puede haber expirado).
    const ls = getLockoutState();
    if (ls.wiped) { setMode("wiped"); return; }
    if (ls.locked) {
      setError(`Esperá ${formatRemaining(ls.remainingMs)} antes del próximo intento.`);
      setLockout(ls);
      return;
    }

    setBusy(true);
    try {
      const ok = await unlockWithPasscode(pin);
      if (!ok) {
        // Registrar el intento fallido — esto puede disparar el wipe a los 10.
        const after = await recordFailedAttempt();
        setLockout(after);
        if (after.wiped) {
          setMode("wiped");
          setBusy(false);
          return;
        }
        if (after.locked) {
          setError(`Passcode incorrecto. Te quedan ${after.attemptsLeft} intento${after.attemptsLeft === 1 ? "" : "s"}. Esperá ${formatRemaining(after.remainingMs)}.`);
        } else {
          setError(`Passcode incorrecto. Te quedan ${after.attemptsLeft} intento${after.attemptsLeft === 1 ? "" : "s"} antes del wipe.`);
        }
        setBusy(false);
        return;
      }
      // Unlock OK → reset del contador.
      resetFailedAttempts();
      setLockout({ locked: false, remainingMs: 0, attemptsLeft: 10, wiped: false, count: 0 });
      // Hidratar el cache de API key.
      await unlockApiKey().catch(() => false);
      toast("Desbloqueado", "success");
      router.push(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleLock = () => {
    lock();
    toast("Bloqueado", "info");
  };

  const handleForget = async () => {
    if (!confirm(
      "Si olvidás el passcode, los datos cifrados quedan irrecuperables: API key y todo el Vault. Esta acción no se puede deshacer. ¿Continuar?"
    )) return;
    await forgetPasscode();
    toast("Passcode eliminado", "info");
    await refreshMode();
  };

  const handleStartOver = async () => {
    // Limpiar el flag wiped del lockout y volver a setup.
    if (typeof localStorage !== "undefined") {
      try { localStorage.removeItem("tampu_pc_failures"); } catch { /* ignore */ }
    }
    await forgetPasscode();
    setMode("setup");
  };

  if (mode === "loading") {
    return <div className="p-8 animate-pulse"><div className="h-32 bg-muted rounded-lg" /></div>;
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-0 animate-fade-in max-w-md mx-auto">
      <header className="px-2 pt-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          {mode === "setup" && <><Shield className="w-6 h-6" />Configurar passcode</>}
          {mode === "unlock" && <><Lock className="w-6 h-6" />Desbloquear Tampu</>}
          {mode === "manage" && <><Unlock className="w-6 h-6" />Seguridad</>}
          {mode === "wiped" && <><Trash2 className="w-6 h-6 text-destructive" />Vault borrado</>}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === "setup" && "Cifrá tu API key y el Vault con un passcode. Sin él, nadie puede leerlos — ni siquiera con acceso al dispositivo."}
          {mode === "unlock" && "Tu API key y Vault están cifrados. Ingresá el passcode para usarlos."}
          {mode === "manage" && "Sesión desbloqueada. Auto-lock por inactividad: 15 min."}
          {mode === "wiped" && "Tu vault fue borrado por 10 intentos fallidos."}
        </p>
      </header>

      {/* SETUP */}
      {mode === "setup" && (
        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="w-4 h-4" />Crear passcode</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Mínimo <strong>12 caracteres</strong> o <strong>4 palabras separadas por espacio</strong> (passphrase, más fácil de recordar y más segura).
              <strong> Guardalo bien</strong> — si lo perdés, no hay recovery: los datos cifrados quedan
              irrecuperables (es by-design — si hubiera backdoor, no sería seguro).
            </p>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Passcode</label>
              <Input
                type="password"
                value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder="Mínimo 12 chars o 4 palabras"
                className="mt-1 font-mono"
                autoComplete="new-password"
                autoFocus
              />
              {/* Strength bar — barra Hornocal con 3 estados. */}
              {pin.length > 0 && strength && (
                <StrengthBar strength={strength} />
              )}
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Repetir passcode</label>
              <Input
                type="password"
                value={pinConfirm}
                onChange={e => setPinConfirm(e.target.value)}
                placeholder="Confirmá"
                className="mt-1 font-mono"
                autoComplete="new-password"
                onKeyDown={e => { if (e.key === "Enter") void handleSetup(); }}
              />
            </div>
            {error && (
              <p className="text-[11px] text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />{error}
              </p>
            )}
            <Turnstile onSuccess={(t) => setTurnstileToken(t)} className="my-1" />
            <Button
              onClick={handleSetup}
              disabled={busy || !strength?.ok || pin !== pinConfirm || !turnstileToken}
              className="w-full"
            >
              {busy ? "Configurando..." : "Activar cifrado"}
            </Button>
            <p className="text-[10px] text-muted-foreground">
              PBKDF2-SHA256 · 600.000 iteraciones · AES-GCM(256). La master key se deriva
              de tu passcode y vive solo en RAM (auto-lock a los 15 min).
            </p>
          </CardContent>
        </Card>
      )}

      {/* UNLOCK */}
      {mode === "unlock" && (
        <Card className="border-l-4 border-l-warning">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Lock className="w-4 h-4" />Ingresá tu passcode</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="password"
              value={pin}
              onChange={e => setPin(e.target.value)}
              placeholder="Passcode"
              className="font-mono"
              autoComplete="current-password"
              autoFocus
              disabled={lockout.locked}
              onKeyDown={e => { if (e.key === "Enter" && !lockout.locked) void handleUnlock(); }}
            />
            {lockout.locked && (
              <div className="rounded-md bg-warning/10 border border-warning/40 px-3 py-2">
                <p className="text-[11px] text-warning-foreground flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-warning" />
                  Esperá <strong className="mx-1">{formatRemaining(lockout.remainingMs)}</strong> antes del próximo intento.
                </p>
                {lockout.attemptsLeft > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Te quedan {lockout.attemptsLeft} intento{lockout.attemptsLeft === 1 ? "" : "s"} antes del wipe.
                  </p>
                )}
              </div>
            )}
            {error && !lockout.locked && (
              <p className="text-[11px] text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />{error}
              </p>
            )}
            <Button onClick={handleUnlock} disabled={busy || !pin || lockout.locked} className="w-full">
              {busy ? "Desbloqueando..." : lockout.locked ? "Esperá..." : "Desbloquear"}
            </Button>
            <button
              onClick={handleForget}
              className="text-[11px] text-muted-foreground underline hover:text-destructive"
            >
              Olvidé mi passcode (resetear · pierdo los datos cifrados)
            </button>
          </CardContent>
        </Card>
      )}

      {/* MANAGE */}
      {mode === "manage" && (
        <>
          <Card className="border-l-4 border-l-success">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Check className="w-4 h-4 text-success" />Cifrado activo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Sesión desbloqueada. La master key vive en memoria; se borra automáticamente
                tras 15 minutos de inactividad o si bloqueás manualmente.
              </p>
              <Button onClick={handleLock} variant="outline" className="gap-2">
                <Lock className="w-4 h-4" />Bloquear ahora
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-warning" />Zona de riesgo</CardTitle>
            </CardHeader>
            <CardContent>
              <button
                onClick={handleForget}
                className="text-xs text-destructive underline hover:opacity-80"
              >
                Olvidar passcode (los datos cifrados quedan irrecuperables)
              </button>
            </CardContent>
          </Card>
        </>
      )}

      {/* WIPED — el vault fue borrado por 10 intentos fallidos. */}
      {mode === "wiped" && (
        <Card className="border-l-4 border-l-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-4 h-4" />Vault borrado por 10 intentos fallidos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              Tu vault local fue borrado después de 10 intentos fallidos de passcode. Si fuiste vos,
              podés crear uno nuevo. Si <strong>no fuiste vos</strong>, alguien intentó entrar a tu
              dispositivo — revisá quién tuvo acceso físico recientemente.
            </p>
            <p className="text-xs text-muted-foreground">
              Los archivos del Vault y la API key cifrada quedaron irrecuperables. Si tenías backup
              en la nube (no aplica a Tampu by default), restauralo desde ahí.
            </p>
            <Button onClick={handleStartOver} className="w-full">
              Crear un passcode nuevo
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Strength bar — paleta Hornocal (oxblood/ocre/sage) ────────────────────

function StrengthBar({ strength }: { strength: PasscodeStrength }) {
  const score = strength.score ?? 0;
  // Mapeo: score 0–2 → débil (rojo oxblood), 3 → aceptable (ocre), 4 → fuerte (sage).
  const level: "weak" | "ok" | "strong" =
    score <= 2 ? "weak" : score === 3 ? "ok" : "strong";

  // Colores: usamos los tokens canónicos definidos en globals.css.
  // destructive (oxblood Hornocal) / warning (ocre mostaza) / success (sage olive).
  const colorClass = {
    weak: "bg-destructive",
    ok: "bg-warning",
    strong: "bg-success",
  }[level];

  const widthClass = {
    weak: "w-1/3",
    ok: "w-2/3",
    strong: "w-full",
  }[level];

  const label = {
    weak: strength.crackTime
      ? `Te crackean en ${strength.crackTime}`
      : "Está muy débil",
    ok: "Aceptable",
    strong: "Fuerte",
  }[level];

  return (
    <div className="mt-2 space-y-1">
      <div className="h-1.5 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={4}>
        <div className={`h-full ${widthClass} ${colorClass} transition-all duration-300`} />
      </div>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-[11px] font-medium ${level === "weak" ? "text-destructive" : level === "ok" ? "text-warning" : "text-success"}`}>
          {label}
        </p>
      </div>
      {strength.reason && !strength.ok && (
        <p className="text-[10px] text-muted-foreground">{strength.reason}</p>
      )}
      {strength.suggestion && !strength.ok && (
        <p className="text-[10px] text-muted-foreground italic">
          → {strength.suggestion}
        </p>
      )}
    </div>
  );
}
