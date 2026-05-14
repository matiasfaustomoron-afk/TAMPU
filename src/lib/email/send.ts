// ─── Resend wrapper para emails transaccionales ─────────────────────────
//
// Por ahora solo necesitamos un único helper: `sendEmail`. Funciona como
// un no-op silencioso si `RESEND_API_KEY` no está seteada — útil para dev
// local sin tener que mockear nada.
//
// Resend free tier: 100 emails/día, suficiente para invitaciones y notifs
// transaccionales en early stage. Ver https://resend.com/pricing.
//
// ENV vars:
//   RESEND_API_KEY   - obligatoria en prod (sin ella, no se manda nada)
//   RESEND_FROM      - opcional, default "Tampu <hola@tampu.app>"
//
// Caller convention: si el send falla, devolvemos `false` pero NO tiramos.
// La razón es que un fallo de email no debe romper el flujo principal (ej.
// la invitación se crea en DB aunque el email no salga — el usuario igual
// puede aceptar manualmente desde la app).

export interface SendEmailOpts {
  to: string;
  subject: string;
  html: string;
  /**
   * Override del from. Default: `RESEND_FROM` env o "Tampu <hola@tampu.app>".
   * Debe estar validado en el Resend dashboard antes de usar.
   */
  from?: string;
  /** Texto plano opcional (Resend lo genera del HTML si no se pasa). */
  text?: string;
  /** Reply-to opcional (ej. el email del invitador). */
  replyTo?: string;
}

export async function sendEmail(opts: SendEmailOpts): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn("[email] RESEND_API_KEY missing — email not sent to", opts.to);
    return false;
  }

  const from = opts.from || process.env.RESEND_FROM || "Tampu <hola@tampu.app>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        reply_to: opts.replyTo,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.error("[email] resend failed", res.status, errText.slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[email] resend threw", (err as Error).message);
    return false;
  }
}
