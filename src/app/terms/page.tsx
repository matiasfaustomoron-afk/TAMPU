// Static Terms of Service — public, no auth required (allow-listed in middleware).

export const metadata = {
  title: "Tampu — Terms of Service",
  description: "Términos de uso de Tampu.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="max-w-3xl mx-auto px-6 py-12 prose-sm">
        <h1 className="text-3xl font-bold mb-2">Terms of Service — Tampu</h1>
        <p className="text-sm text-muted-foreground">Última actualización: 2026-05-11. Versión preliminar.</p>

        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-2">1. Aceptación</h2>
          <p className="text-sm">
            Al usar Tampu aceptás estos términos. Si no estás de acuerdo, no uses la app.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-semibold mb-2">2. Qué es Tampu</h2>
          <p className="text-sm">
            Tampu es una herramienta de software para planificar y administrar viajes complejos.
            Es una herramienta de productividad — <strong>NO</strong> es una agencia de viajes, no reserva pasajes,
            no contrata seguros, no emite visas. Toda gestión real ocurre con los proveedores que vos elegís.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-semibold mb-2">3. Datos del usuario</h2>
          <p className="text-sm">
            Vos sos dueño de tus datos. Tampu los almacena en tu propio backend (Supabase) o en el dispositivo
            (modo demo). Detalles: ver <a className="underline" href="/privacy">privacy policy</a>.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-semibold mb-2">4. Información sanitaria y de visas</h2>
          <p className="text-sm">
            Los datos de vacunas y visas son <strong>de referencia, generados de fuentes públicas</strong> (CDC,
            sitios oficiales de inmigración). NO sustituyen consulta médica ni asesoramiento legal/migratorio.
            Las regulaciones cambian; verificá con la embajada y un médico antes de viajar.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-semibold mb-2">5. Asistente IA</h2>
          <p className="text-sm">
            El asistente opcional usa modelos de lenguaje. Sus respuestas son sugerencias basadas en el estado de
            tu viaje — pueden contener errores. No tomes decisiones críticas únicamente basadas en el asistente.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-semibold mb-2">6. Sin garantías</h2>
          <p className="text-sm">
            Tampu se entrega &ldquo;tal cual está&rdquo;, sin garantías de exactitud o disponibilidad continua.
            Los autores no se responsabilizan por pérdidas derivadas del uso (vuelos perdidos, reservas mal cargadas,
            decisiones tomadas con datos desactualizados).
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-semibold mb-2">7. Uso aceptable</h2>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li>No reverse engineering del cliente.</li>
            <li>No automatizar accesos masivos al asistente (rate limits aplican).</li>
            <li>No subir contenido ilegal o que viole copyright.</li>
            <li>No usar Tampu para coordinar actividades ilegales.</li>
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-semibold mb-2">8. Cambios</h2>
          <p className="text-sm">
            Estos términos pueden cambiar. Versión vigente acá. Cambios sustanciales se anunciarán dentro de la app
            con 14 días de antelación.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-semibold mb-2">9. Contacto</h2>
          <p className="text-sm">Preguntas: <code>legal@travel-os.app</code></p>
        </section>
      </main>
    </div>
  );
}
