// ─── /recap/[tripId] ──────────────────────────────────────────────────────
//
// Página pública que wrappea el PNG generado en /api/recap/[tripId].
// Sirve dos propósitos:
//   1. Tener un og:image apuntando al endpoint Edge — preview en
//      WhatsApp/Twitter/iMessage al pegar el link.
//   2. Mostrar el recap a humanos que abren el link en browser, con CTA
//      a la landing.
//
// Esta ruta está whitelisteada en middleware (PUBLIC_PATHS incluye "/recap").

import type { Metadata } from "next";

interface Props {
  params: Promise<{ tripId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tripId } = await params;
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://tampu-delta.vercel.app";
  const imageUrl = `${baseUrl}/api/recap/${tripId}`;
  return {
    title: "Mi viaje en Tampu",
    description: "Resumen de mi viaje",
    openGraph: {
      title: "Mi viaje en Tampu",
      description: "Resumen visual del viaje",
      images: [imageUrl],
    },
    twitter: {
      card: "summary_large_image",
      images: [imageUrl],
    },
  };
}

export default async function RecapPage({ params }: Props) {
  const { tripId } = await params;
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://tampu-delta.vercel.app";
  const imageUrl = `${baseUrl}/api/recap/${tripId}`;
  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="max-w-2xl space-y-6 text-center">
        <h1 className="text-3xl font-bold">Mi viaje en Tampu</h1>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt="Recap del viaje"
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
