"use client";

export const dynamic = "force-dynamic";

// ─── /auth/callback ───
//
// Maneja el code que Supabase devuelve después de:
//   - Email confirmation (signup con email)
//   - Magic link (passwordless)
//   - OAuth provider (Google, Apple si los agregamos)
//
// CLIENT-SIDE (no server route) porque createBrowserClient usa PKCE flow por
// default, y el code_verifier vive en localStorage del browser que hizo el
// signup. Si manejamos el exchange server-side, el verifier no está accesible
// → exchangeCodeForSession falla.
//
// Esta página runs in the browser, lee `code` del query, llama
// exchangeCodeForSession (que internamente lee el verifier de localStorage),
// y redirige a `next` (default /today) con window.location.href para
// garantizar full reload y propagación de cookies al middleware.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function CallbackHandler() {
  const params = useSearchParams();
  const [status, setStatus] = useState<"working" | "error">("working");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get("code");
    const next = params.get("next") || "/today";
    const errorDescription = params.get("error_description") || params.get("error");

    // Supabase puede mandar errores como query params si el OAuth provider falla
    if (errorDescription) {
      setErrorMsg(errorDescription);
      setStatus("error");
      return;
    }

    if (!code) {
      setErrorMsg("No se recibió código de confirmación. El link puede haber expirado o ya haber sido usado.");
      setStatus("error");
      return;
    }

    (async () => {
      const sb = createClient();
      if (!sb) {
        setErrorMsg("Supabase no está configurado. Contactá al admin.");
        setStatus("error");
        return;
      }

      try {
        const { data, error } = await sb.auth.exchangeCodeForSession(code);
        if (error) {
          setErrorMsg(error.message);
          setStatus("error");
          return;
        }
        if (!data.session) {
          setErrorMsg("Code intercambiado pero no se creó sesión. Intentá login manual.");
          setStatus("error");
          return;
        }
        // Full reload para que middleware vea las cookies recién seteadas
        window.location.href = next;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setErrorMsg(`Error inesperado: ${message}`);
        setStatus("error");
      }
    })();
  }, [params]);

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-xl font-semibold">No pudimos confirmar tu cuenta</h1>
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
          <a href="/login" className="inline-block text-sm text-primary underline">Volver al login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="text-sm text-muted-foreground">Confirmando tu cuenta...</div>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Cargando...</div>}>
      <CallbackHandler />
    </Suspense>
  );
}
