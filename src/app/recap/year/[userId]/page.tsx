// ─── /recap/year/[userId] ─────────────────────────────────────────────────
//
// Página pública que wrappea el PNG generado en /api/recap/year/[userId]
// (Tampu Unpacked YYYY). Sirve dos propósitos:
//   1. Tener un og:image apuntando al endpoint Edge — preview rico en
//      WhatsApp/Twitter/iMessage al pegar el link.
//   2. Mostrar el recap a humanos que abren el link en browser, con CTA
//      a la landing.
//
// Esta ruta hereda el whitelisting del middleware (PUBLIC_PATHS incluye
// "/recap", que matchea por prefijo).

import type { Metadata } from "next";

interface Props {
  params: Promise<{ userId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { userId } = await params;
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://tampu-delta.vercel.app";
  const imageUrl = `${baseUrl}/api/recap/year/${userId}`;
  const year = new Date().getUTCFullYear();
  return {
    title: `Tampu Unpacked ${year}`,
    description: "Mi año en viajes — resumen Tampu",
    openGraph: {
      title: `Tampu Unpacked ${year}`,
      description: "Mi año en viajes — resumen visual Tampu",
      images: [imageUrl],
    },
    twitter: {
      card: "summary_large_image",
      images: [imageUrl],
    },
  };
}

export default async function YearRecapPage({ params }: Props) {
  const { userId } = await params;
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://tampu-delta.vercel.app";
  const imageUrl = `${baseUrl}/api/recap/year/${userId}`;
  const year = new Date().getUTCFullYear();
  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="max-w-2xl space-y-6 text-center">
        <h1 className="text-3xl font-bold">Tampu Unpacked {year}</h1>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={`Tampu Unpacked ${year}`}
          className="w-full rounded-2xl shadow-2xl"
          width={1200}
          height={630}
        />
        <p className="text-sm text-muted-foreground">
          Tampu — tu travel companion en español.{" "}
          <a href="/welcome" className="underline">
            Probalo gratis
          </a>
          .
        </p>
      </div>
    </div>
  );
}
