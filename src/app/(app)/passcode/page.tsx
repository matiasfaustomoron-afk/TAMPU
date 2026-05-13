"use client";

/**
 * /passcode — flow dedicado de setup / unlock del passcode de cifrado.
 *
 * Tres modos según estado:
 *   1. Setup: no hay passcode. Pedimos crear uno (con confirmación).
 *   2. Unlock: hay passcode, app bloqueada. Pedimos el passcode.
 *   3. Manage: hay passcode, app desbloqueada. Mostramos status + opciones
 *      (cambiar passcode, lock manual, "olvidé mi passcode").
 *
 * Después de un setup/unlock exitoso, redirigimos a la URL `?next=...` si
 * existe, o a /settings por default.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Shield, KeyRound, AlertTriangle, Check, Unlock } from "lucide-react";
import {
  hasPasscode,
  isUnlocked,
  setupPasscode,
  unlockWithPasscode,
  lock,
  forgetPasscode,
  onLockChange,
} from "@/lib/crypto/passcode";
import { unlockApiKey, migrateLegacyApiKey, hasLegacyPlainApiKey } from "@/lib/ai/user-key";
import { toast } from "@/components/ios/toast";

type Mode = "loading" | "setup" | "unlock" | "manage";

export default function PasscodePage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/settings";

  const [mode, setMode] = useState<Mode>("loading");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determinar el modo inicial según el estado.
  const refreshMode = useCallback(async () => {
    const has = await hasPasscode();
    if (!has) { setMode("setup"); return; }
    setMode(isUnlocked() ? "manage" : "unlock");
  }, []);

  useEffect(() => {
    void refreshMode();
    const off = onLockChange(() => void refreshMode());
    return off;
  }, [refreshMode]);

  const handleSetup = async () => {
    setError(null);
    if (pin.length < 6) { setError("El passcode debe tener al menos 6 caracteres."); return; }
    if (pin !== pinConfirm) { setError("Los passcodes no coinciden."); return; }
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
    setBusy(true);
    try {
      const ok = await unlockWithPasscode(pin);
      if (!ok) {
        setError("Passcode incorrecto");
        setBusy(false);
        return;
      }
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
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {mode === "setup" && "Cifrá tu API key y el Vault con un passcode. Sin él, nadie puede leerlos — ni siquiera con acceso al dispositivo."}
          {mode === "unlock" && "Tu API key y Vault están cifrados. Ingresá el passcode para usarlos."}
          {mode === "manage" && "Sesión desbloqueada. Auto-lock por inactividad: 15 min."}
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
              Mínimo 6 caracteres. Podés usar números, letras, o una frase corta (más segura).
              <strong> Guardalo bien</strong> — si lo perdés, no hay recovery: los datos cifrados quedan
              irrecuperables (es by-design — si hubiera backdoor, no sería seguro).
            </p>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Passcode</label>
              <Input
                type="password"
                value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="mt-1 font-mono"
                autoComplete="new-password"
                autoFocus
              />
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
            <Button onClick={handleSetup} disabled={busy || pin.length < 6 || pin !== pinConfirm} className="w-full">
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
              onKeyDown={e => { if (e.key === "Enter") void handleUnlock(); }}
            />
            {error && (
              <p className="text-[11px] text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />{error}
              </p>
            )}
            <Button onClick={handleUnlock} disabled={busy || !pin} className="w-full">
              {busy ? "Desbloqueando..." : "Desbloquear"}
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
    </div>
  );
}
