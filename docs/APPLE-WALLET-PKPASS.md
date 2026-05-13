# Travel OS — Apple Wallet integration (.pkpass)

Tripsy y los e-tickets de las aerolíneas usan Apple Wallet para tarjetas digitales. Para Travel OS, esto cierra el último gap visual contra Tripsy + da utilidad real (boarding pass + insurance card + emergency card en la Wallet del iPhone).

## Arquitectura

```
[Server (Vercel)]                    [iPhone]
   │                                    │
   │  GET /api/wallet/{type}/{id}       │
   │ ◄────────────────────────────────  │  (link "Add to Apple Wallet")
   │                                    │
   │  Generate .pkpass:                 │
   │   1. JSON pass.json                │
   │   2. Sign with Pass Type ID cert   │
   │   3. Zip                           │
   │ ──── response: application/vnd.apple.pkpass ──► Wallet adds pass automatically
```

## Pre-requisitos

1. **Apple Developer Program** activo
2. **Pass Type ID certificate** (developer.apple.com → Certificates, IDs & Profiles → Pass Type IDs → +)
   - Description: `Travel OS Boarding Pass`
   - Identifier: `pass.com.travelos.app`
   - Download .cer → convert to .p12 in Keychain
3. **WWDR certificate** (Apple Worldwide Developer Relations) — required to sign passes

## Setup

### 1. Tipos de pass de Travel OS

| Tipo | Pass style | Datos clave |
|---|---|---|
| **Boarding pass** | boardingPass | Vuelo + locator + asiento + barcode |
| **Insurance card** | generic | Proveedor + póliza + contacto 24h |
| **Emergency card** | generic | SOS por país + consulado + GOP info |
| **Reservation** | generic | Hotel/tour + locator + check-in date |

### 2. Server-side: install `passkit-generator`

```bash
npm install passkit-generator
```

### 3. Crear `src/app/api/wallet/[type]/[id]/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { PKPass } from "passkit-generator";
import path from "node:path";

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;

  // Fetch the resource from Supabase / demo seed
  const reservation = await fetchReservation(id); // your function
  if (!reservation) return new NextResponse("Not found", { status: 404 });

  const pass = await PKPass.from({
    model: path.join(process.cwd(), "wallet-models", type),  // pass template folder
    certificates: {
      wwdr: process.env.PKPASS_WWDR!,
      signerCert: process.env.PKPASS_SIGNER_CERT!,
      signerKey: process.env.PKPASS_SIGNER_KEY!,
      signerKeyPassphrase: process.env.PKPASS_PASSPHRASE!,
    },
  }, {
    serialNumber: id,
    description: reservation.description,
    organizationName: "Travel OS",
    passTypeIdentifier: "pass.com.travelos.app",
    teamIdentifier: process.env.APNS_TEAM_ID!,
  });

  // Populate fields specific to the pass type
  if (type === "boarding") {
    pass.boardingPass = {
      transitType: "PKTransitTypeAir",
      primaryFields: [{ key: "from", label: "FROM", value: "GRU" }, { key: "to", label: "TO", value: "MNL" }],
      auxiliaryFields: [{ key: "date", label: "DATE", value: reservation.use_date }],
      // ...
    };
    pass.barcodes = [{ format: "PKBarcodeFormatQR", message: reservation.locator || id, messageEncoding: "iso-8859-1" }];
  }

  const buffer = pass.getAsBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="${reservation.description.slice(0, 32)}.pkpass"`,
    },
  });
}
```

### 4. Pass template

Crear `wallet-models/boarding/`:
```
pass.json           ← strings + colors + layout
icon.png            ← 29×29
icon@2x.png         ← 58×58
icon@3x.png         ← 87×87
logo.png            ← 160×50
logo@2x.png         ← 320×100
```

Mínimo viable `pass.json`:
```json
{
  "formatVersion": 1,
  "passTypeIdentifier": "pass.com.travelos.app",
  "serialNumber": "REPLACE_AT_RUNTIME",
  "teamIdentifier": "REPLACE_AT_RUNTIME",
  "organizationName": "Travel OS",
  "description": "Boarding Pass",
  "backgroundColor": "rgb(10, 10, 15)",
  "foregroundColor": "rgb(250, 250, 250)",
  "labelColor": "rgb(16, 185, 129)"
}
```

### 5. Cliente: botón "Add to Apple Wallet"

```tsx
// En /reservations detail
<a
  href={`/api/wallet/boarding/${reservation.id}`}
  className="inline-flex items-center gap-2 px-3 py-1.5 bg-black text-white rounded-md text-sm"
>
  <AppleIcon /> Add to Apple Wallet
</a>
```

En Safari iOS, esto abre automáticamente Wallet con preview del pass. Tap "Add" → queda guardado.

## Pricing / cost

- Pass Type ID cert: **gratis** dentro del Developer Program ($99/año que ya pagás)
- WWDR cert: gratis
- Vercel function invocations: 1M/mes gratis (cada generación de pass = 1 invoke)

## Compliance Apple

- Apple revisa que tu pass.json sea válido al primer abrir. Si falla, el usuario ve "Could not add pass".
- No incluyas información sensible (numero completo de seguro, contraseñas) — passes pueden compartirse vía AirDrop accidentalmente.
- Para passes que se actualizan en vivo (vuelo retrasado), implementá `webServiceURL` + endpoint de updates en la pass.json. Más trabajo.

## Plan progresivo

- **Fase 1**: solo boarding passes para vuelos confirmados (2-3 días de trabajo en Mac)
- **Fase 2**: insurance card + emergency card (1 día más)
- **Fase 3**: updates en tiempo real con webServiceURL (1 semana)

## Por qué importa para App Store

Apple **ama** las apps que integran Wallet. Demuestra:
1. Uso real de ecosistema iOS (no es webview)
2. Atención al detalle UX (Wallet es nativo per excellence)
3. Valor añadido vs PWA equivalente

Implementar Wallet + Push + Camera + Share + Haptics es la diferencia entre "rechazo 4.2" y "fast-track approval".
