import { redirect } from "next/navigation";

// Trip detail no existe como vista propia: cuando el usuario tap-ea un viaje
// de la lista, se activa y va al feed de Hoy. /dashboard fue removido en mayo 2026.
export default function TripDetailPage() {
  redirect("/today");
}
