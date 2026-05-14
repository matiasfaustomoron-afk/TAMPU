import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";

// Root redirect: anon → /welcome (landing), auth'd → /today (app).
// Antes redirigía siempre a /today que requiere auth → anon caía al login sin
// ver nunca la landing, dejando /welcome como dead path solo accesible por URL.
export default async function Home() {
  const supa = await createSupabaseServer();
  if (!supa) {
    // Supabase no configurado → demo mode / anon
    redirect("/welcome");
  }
  const { data: { user } } = await supa.auth.getUser();
  if (!user) {
    redirect("/welcome");
  }
  redirect("/today");
}
