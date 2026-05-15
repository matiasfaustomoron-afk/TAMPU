import { NextRequest, NextResponse } from "next/server";
import { PKPass } from "passkit-generator";
import { createSupabaseServer } from "@/lib/supabase/server";

/**
 * `.pkpass` generator — Apple Wallet boarding pass / event ticket / generic pass.
 *
 * Recibe los datos de una reserva (vuelo, hotel) y produce un archivo `.pkpass`
 * firmado con el certificado de Tampu Pass Type ID. El usuario hace tap en el
 * archivo desde Safari/Mail → iOS abre Apple Wallet → "Agregar".
 *
 * SETUP — requiere Apple Developer Account ($99/año):
 *   1. Apple Developer → Identifiers → Pass Type IDs → registrar `pass.com.tampu.boarding`
 *   2. Generar Pass Type ID certificate (.p12) y descargarlo
 *   3. WWDR intermediate cert: https://www.apple.com/certificateauthority/
 *   4. Convertir .p12 a .pem:
 *      openssl pkcs12 -in pass.p12 -clcerts -nokeys -out signerCert.pem
 *      openssl pkcs12 -in pass.p12 -nocerts -out signerKey.pem -nodes
 *   5. Setear ENV (base64 del contenido del .pem):
 *      PKPASS_TEAM_ID, PKPASS_PASS_TYPE_ID, PKPASS_SIGNER_CERT_B64,
 *      PKPASS_SIGNER_KEY_B64, PKPASS_WWDR_CERT_B64
 *
 * Sin certificado configurado: endpoint devuelve 503 + instrucciones. Sin romper.
 */

export const runtime = "nodejs";

interface PassRequest {
  type: "flight" | "hotel" | "generic";
  serial: string;
  description: string;
  organizationName?: string;
  // Ownership context — el server valida que el caller tenga acceso a este
  // trip antes de firmar el pkpass. `reservation_id` es opcional pero si viene,
  // también se valida ownership de la reserva.
  trip_id?: string;
  reservation_id?: string;
  flight?: {
    carrier: string;
    flightNumber: string;
    origin: string;
    destination: string;
    departure: string;
    gate?: string;
    seat?: string;
    locator?: string;
    passengerName?: string;
  };
  hotel?: {
    name: string;
    address: string;
    checkIn: string;
    checkOut: string;
    locator?: string;
    guestName?: string;
  };
  backgroundColor?: string;
  foregroundColor?: string;
}

function isOriginAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // server-side fetch / curl OK — auth Supabase nos cubre
  const allowed = new Set<string>();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (siteUrl) allowed.add(siteUrl);
  allowed.add("http://localhost:3000");
  allowed.add("http://localhost:3001");
  allowed.add("capacitor://localhost");
  allowed.add("ionic://localhost");
  if (origin.endsWith(".vercel.app")) return true;
  return allowed.has(origin.replace(/\/$/, ""));
}

function buildPassJson(req: PassRequest): Record<string, unknown> {
  const teamId = process.env.PKPASS_TEAM_ID;
  const passTypeId = process.env.PKPASS_PASS_TYPE_ID || "pass.com.tampu.boarding";

  const base = {
    formatVersion: 1,
    passTypeIdentifier: passTypeId,
    serialNumber: req.serial,
    teamIdentifier: teamId,
    organizationName: req.organizationName || "Tampu",
    description: req.description,
    backgroundColor: req.backgroundColor || "rgb(199, 91, 47)",
    foregroundColor: req.foregroundColor || "rgb(255, 255, 255)",
    labelColor: "rgb(245, 239, 224)",
  };

  if (req.type === "flight" && req.flight) {
    const f = req.flight;
    return {
      ...base,
      boardingPass: {
        transitType: "PKTransitTypeAir",
        primaryFields: [
          { key: "origin", label: "Salida", value: f.origin },
          { key: "destination", label: "Llegada", value: f.destination },
        ],
        secondaryFields: [
          { key: "passenger", label: "Pasajero", value: f.passengerName || "" },
          { key: "flight", label: "Vuelo", value: `${f.carrier} ${f.flightNumber}` },
        ],
        auxiliaryFields: [
          {
            key: "departure",
            label: "Hora",
            value: new Date(f.departure).toLocaleString("es-AR", {
              dateStyle: "short",
              timeStyle: "short",
            }),
          },
          ...(f.gate ? [{ key: "gate", label: "Puerta", value: f.gate }] : []),
          ...(f.seat ? [{ key: "seat", label: "Asiento", value: f.seat }] : []),
        ],
        backFields: [
          ...(f.locator ? [{ key: "locator", label: "Localizador", value: f.locator }] : []),
          { key: "powered", label: "", value: "Generado por Tampu · tampu.app" },
        ],
      },
    };
  }

  if (req.type === "hotel" && req.hotel) {
    const h = req.hotel;
    return {
      ...base,
      generic: {
        primaryFields: [{ key: "hotel", label: "Hotel", value: h.name }],
        secondaryFields: [
          { key: "checkin", label: "Check-in", value: h.checkIn },
          { key: "checkout", label: "Check-out", value: h.checkOut },
        ],
        auxiliaryFields: [
          ...(h.guestName ? [{ key: "guest", label: "Huésped", value: h.guestName }] : []),
          ...(h.locator ? [{ key: "locator", label: "Reserva", value: h.locator }] : []),
        ],
        backFields: [
          { key: "address", label: "Dirección", value: h.address },
          { key: "powered", label: "", value: "Generado por Tampu · tampu.app" },
        ],
      },
    };
  }

  return {
    ...base,
    generic: {
      primaryFields: [{ key: "title", label: "Pase", value: req.description }],
    },
  };
}

/**
 * 1×1 transparent PNG placeholder for required pass images (icon/logo).
 * Apple requires icon.png + icon@2x.png at minimum. En producción se reemplaza
 * por el ícono real Tampu desde un bucket o assets bundle.
 */
const TRANSPARENT_PX_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

export async function POST(req: NextRequest) {
  // ─── Origin check (anti-CSRF) ───
  if (!isOriginAllowed(req)) {
    return NextResponse.json({ error: "forbidden_origin" }, { status: 403 });
  }

  // ─── Auth server-side ───
  const sb = await createSupabaseServer();
  if (!sb) {
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // TODO(security): aplicar rate-limit con `canCallProxy(req, "/api/pkpass")`.
  // Por ahora la auth + ownership check ya elimina el vector de abuso anónimo;
  // el rate-limit es defensa-en-profundidad para evitar que un user logueado
  // queme el certificado generando 10k passes/min.

  const teamId = process.env.PKPASS_TEAM_ID;
  const certB64 = process.env.PKPASS_SIGNER_CERT_B64;
  const keyB64 = process.env.PKPASS_SIGNER_KEY_B64;
  const keyPassphrase = process.env.PKPASS_SIGNER_KEY_PASSPHRASE || "";
  const wwdrB64 = process.env.PKPASS_WWDR_CERT_B64;

  if (!teamId || !certB64 || !keyB64 || !wwdrB64) {
    return NextResponse.json(
      {
        error: "Apple Wallet certificate not configured",
        setup: {
          required_env: [
            "PKPASS_TEAM_ID",
            "PKPASS_PASS_TYPE_ID",
            "PKPASS_SIGNER_CERT_B64 (cert .pem base64)",
            "PKPASS_SIGNER_KEY_B64 (key .pem base64)",
            "PKPASS_SIGNER_KEY_PASSPHRASE (opcional, si la key tiene passphrase)",
            "PKPASS_WWDR_CERT_B64 (Apple WWDR intermediate)",
          ],
          docs: "Ver src/app/api/pkpass/route.ts comentarios para setup completo",
        },
      },
      { status: 503 },
    );
  }

  let body: PassRequest;
  try {
    body = (await req.json()) as PassRequest;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body.type || !body.serial || !body.description) {
    return NextResponse.json({ error: "type, serial, description requeridos" }, { status: 400 });
  }

  // ─── Ownership check ───
  // Si el caller pasa `trip_id`, validamos que pertenezca al user (owner o
  // member). Si pasa `reservation_id`, validamos que su trip pertenezca al
  // user. Sin estos campos, dejamos pasar para back-compat — pero idealmente
  // el client SIEMPRE manda al menos uno.
  if (body.trip_id) {
    const { data: trip } = await sb
      .from("trips")
      .select("id, user_id")
      .eq("id", body.trip_id)
      .maybeSingle();
    let allowed = trip?.user_id === user.id;
    if (!allowed && trip) {
      // Check trip_members
      const { data: member } = await sb
        .from("trip_members")
        .select("trip_id")
        .eq("trip_id", body.trip_id)
        .eq("user_id", user.id)
        .maybeSingle();
      allowed = !!member;
    }
    if (!allowed) {
      return NextResponse.json({ error: "forbidden_trip" }, { status: 403 });
    }
  }
  if (body.reservation_id) {
    const { data: reservation } = await sb
      .from("reservations")
      .select("id, trip_id")
      .eq("id", body.reservation_id)
      .maybeSingle();
    if (!reservation) {
      return NextResponse.json({ error: "reservation_not_found" }, { status: 404 });
    }
    const { data: trip } = await sb
      .from("trips")
      .select("user_id")
      .eq("id", reservation.trip_id)
      .maybeSingle();
    let allowed = trip?.user_id === user.id;
    if (!allowed && trip) {
      const { data: member } = await sb
        .from("trip_members")
        .select("trip_id")
        .eq("trip_id", reservation.trip_id)
        .eq("user_id", user.id)
        .maybeSingle();
      allowed = !!member;
    }
    if (!allowed) {
      return NextResponse.json({ error: "forbidden_reservation" }, { status: 403 });
    }
  }

  const passJson = buildPassJson(body);

  try {
    // Build .pkpass desde buffers en memoria (no necesita filesystem).
    const pass = new PKPass(
      {
        // Required image buffers — Apple Wallet requiere icon. Acá usamos placeholder
        // transparente. En producción, reemplazar con buffers del logo real.
        "icon.png": TRANSPARENT_PX_PNG,
        "icon@2x.png": TRANSPARENT_PX_PNG,
        "logo.png": TRANSPARENT_PX_PNG,
        "logo@2x.png": TRANSPARENT_PX_PNG,
      },
      {
        wwdr: Buffer.from(wwdrB64, "base64"),
        signerCert: Buffer.from(certB64, "base64"),
        signerKey: Buffer.from(keyB64, "base64"),
        signerKeyPassphrase: keyPassphrase || undefined,
      },
      passJson as Record<string, unknown> & { passTypeIdentifier: string },
    );

    const buffer = pass.getAsBuffer();

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="${body.serial}.pkpass"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[pkpass] signing failed:", err);
    return NextResponse.json(
      {
        error: "pkpass-signing-failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
