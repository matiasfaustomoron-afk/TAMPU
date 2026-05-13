/**
 * WhatsApp outbound — server-side. Responde al user después de procesar
 * un mensaje inbound (parsed booking, comando de soporte, etc).
 *
 * Soporta los 2 providers que tenemos wired:
 *  - Twilio WhatsApp Business API
 *  - Meta WhatsApp Cloud API
 *
 * Server-only. NUNCA importar desde client.
 *
 * ENV requeridas según provider:
 *
 *   Twilio:
 *     TWILIO_ACCOUNT_SID
 *     TWILIO_AUTH_TOKEN
 *     TWILIO_WHATSAPP_FROM (whatsapp:+15558005400)
 *
 *   Meta Cloud:
 *     META_WHATSAPP_PHONE_NUMBER_ID
 *     META_WHATSAPP_ACCESS_TOKEN
 *
 * Sin envs configuradas → no-op + log warning. La función NO tira error;
 * el caller decide qué hacer.
 */

export type WhatsAppProvider = "twilio" | "meta";

interface SendOpts {
  to: string;     // número con formato E.164: "+5491155512345"
  body: string;   // texto del mensaje
  provider?: WhatsAppProvider; // default: lo que esté configurado
}

interface SendResult {
  ok: boolean;
  provider: WhatsAppProvider | null;
  messageId?: string;
  error?: string;
}

function detectProvider(): WhatsAppProvider | null {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) return "twilio";
  if (process.env.META_WHATSAPP_ACCESS_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID) return "meta";
  return null;
}

/**
 * Envía un mensaje WhatsApp al user. El provider se auto-detecta a partir
 * de las envs presentes (Twilio prioritario si ambas existen).
 */
export async function sendWhatsAppMessage(opts: SendOpts): Promise<SendResult> {
  const provider = opts.provider ?? detectProvider();
  if (!provider) {
    console.warn("[whatsapp-outbound] no provider configured (TWILIO_* or META_WHATSAPP_*)");
    return { ok: false, provider: null, error: "no-provider-configured" };
  }

  // Twilio
  if (provider === "twilio") {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_FROM; // "whatsapp:+15558005400"
    if (!sid || !token || !from) {
      return { ok: false, provider, error: "twilio-env-missing" };
    }
    const toFormatted = opts.to.startsWith("whatsapp:") ? opts.to : `whatsapp:${opts.to}`;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
        },
        body: new URLSearchParams({
          From: from,
          To: toFormatted,
          Body: opts.body,
        }).toString(),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { ok: false, provider, error: `twilio-${res.status}: ${errText.slice(0, 200)}` };
      }
      const json = (await res.json()) as { sid?: string };
      return { ok: true, provider, messageId: json.sid };
    } catch (err) {
      return { ok: false, provider, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Meta Cloud API
  if (provider === "meta") {
    const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.META_WHATSAPP_ACCESS_TOKEN;
    if (!phoneNumberId || !token) {
      return { ok: false, provider, error: "meta-env-missing" };
    }
    const to = opts.to.replace(/^whatsapp:/, "").replace(/^\+/, "");
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: opts.body },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { ok: false, provider, error: `meta-${res.status}: ${errText.slice(0, 200)}` };
      }
      const json = (await res.json()) as { messages?: Array<{ id: string }> };
      return { ok: true, provider, messageId: json.messages?.[0]?.id };
    } catch (err) {
      return { ok: false, provider, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return { ok: false, provider: null, error: "unknown-provider" };
}

/**
 * Helper: responder al user con confirmación de procesamiento de su forward.
 * Formato amigable en español.
 */
export async function ackBookingsParsed(
  to: string,
  count: number,
  carrier_hint: string | null,
): Promise<SendResult> {
  const body =
    count === 0
      ? "🤔 Tampu recibió tu mensaje pero no detectó ninguna reserva. Si era una confirmación, asegurate de mandar el cuerpo completo del email."
      : count === 1
      ? `✅ Tampu agregó 1 reserva${carrier_hint ? ` de ${carrier_hint}` : ""} a tu viaje. Abrí la app para revisarla.`
      : `✅ Tampu agregó ${count} reservas${carrier_hint ? ` de ${carrier_hint}` : ""} a tu viaje. Abrí la app para revisarlas.`;
  return sendWhatsAppMessage({ to, body });
}
