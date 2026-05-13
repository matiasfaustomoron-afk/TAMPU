// Static privacy policy page — accessible without authentication.
// Lives outside the (app) group so middleware does not redirect to /login.
// This URL is what you submit to App Store Connect as the Privacy Policy URL.

export const metadata = {
  title: "Tampu — Privacy Policy",
  description: "Cómo Tampu maneja tus datos.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="max-w-3xl mx-auto px-6 py-12 prose-sm">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy — Tampu</h1>
        <p className="text-sm text-muted-foreground">Última actualización: 2026-05-11. Versión preliminar.</p>

        <section className="mt-8">
          <h2 className="text-xl font-semibold mb-2">1. Resumen</h2>
          <p className="text-sm">
            Tampu es una herramienta personal de gestión de viajes. Diseñamos la app para que vivas tu viaje sin entregar
            tus datos a terceros. Los datos que cargás (reservas, gastos, documentos) se guardan en{" "}
            <strong>tu propia base de datos Supabase</strong> bajo control tuyo, o en{" "}
            <strong>localStorage de tu dispositivo</strong> si usás el modo demo.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-semibold mb-2">2. Qué datos guardamos</h2>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li>Información del viaje que vos cargás: destinos, fechas, presupuesto, tareas, gastos, reservas.</li>
            <li>Documentos críticos que subís al Vault (pasaporte, visas, seguros) — solo metadata + archivo en Supabase Storage.</li>
            <li>Tu email + ID de usuario de Supabase Auth (si elegís modo online).</li>
            <li>Preferencias locales: idioma, tema visual.</li>
          </ul>
          <p className="text-sm mt-2"><strong>NO recolectamos</strong>: ubicación GPS continua, contactos del teléfono, fotos sin tu acción explícita, historial de navegación, datos publicitarios.</p>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-semibold mb-2">3. Dónde se guardan</h2>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li><strong>Modo demo</strong>: 100% en tu dispositivo (localStorage / Capacitor Preferences). Nunca salen del teléfono.</li>
            <li><strong>Modo online</strong>: en una instancia de Supabase que vos configurás. Tampu no opera servidores propios.</li>
            <li><strong>Asistente IA</strong>: si activás la integración, el resumen del estado de tu viaje se envía a la API de Anthropic con tu clave (server-side via /api/assistant). Sin clave, todo se procesa local con heurísticas.</li>
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-semibold mb-2">4. Permisos en iOS</h2>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li><strong>Notificaciones locales</strong>: opcional — para recordatorios de deadlines sin internet.</li>
            <li><strong>Cámara / Photo Library</strong>: opcional — para subir documentos al Vault.</li>
            <li><strong>Compartir / Share Sheet</strong>: para exportar resumen del viaje.</li>
          </ul>
          <p className="text-sm mt-2">No usamos: ubicación, contactos, micrófono, salud.</p>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-semibold mb-2">5. Terceros</h2>
          <ul className="list-disc list-inside text-sm space-y-1">
            <li><strong>Supabase</strong> — almacenamiento de tus datos. Solo si elegís modo online. <a className="underline" href="https://supabase.com/privacy">Política Supabase</a>.</li>
            <li><strong>Anthropic (Claude API)</strong> — opcional, asistente IA + parser de emails. Solo si configurás la clave. <a className="underline" href="https://www.anthropic.com/legal/privacy">Política Anthropic</a>.</li>
            <li><strong>OpenStreetMap</strong> — tiles del mapa. Carga pública sin tracking.</li>
            <li><strong>CDN unpkg</strong> — assets de Leaflet (iconos del mapa).</li>
            <li><strong>Open-Meteo</strong> — pronóstico del clima del destino. Endpoint público sin key, sin cookies.</li>
          </ul>
          <p className="text-sm mt-2"><strong>NO usamos</strong>: Google Analytics, Facebook SDK, ad networks, trackers de terceros, fingerprinting.</p>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-semibold mb-2">6. Parser de emails de confirmación (Importar)</h2>
          <p className="text-sm">
            Cuando pegás un email de confirmación en la pantalla Importar (Cartera → Importar),
            el texto se envía a la API de Anthropic <strong>solo si tenés tu clave configurada</strong>,
            y la respuesta (datos estructurados) se guarda en tu dispositivo o Supabase. Sin clave,
            el parser corre 100% local con heurística — el texto no sale del dispositivo.
          </p>
          <p className="text-sm mt-2">
            <strong>Tampu no persiste el texto del email</strong> en ningún momento. El endpoint
            <code className="mx-1">/api/parse-email-confirmation</code> es stateless: recibe, parsea,
            devuelve y olvida.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-semibold mb-2">7. App Privacy — datos recolectados (App Store)</h2>
          <p className="text-sm mb-3">
            Declaración formal para Apple App Store Connect. Esta tabla refleja exactamente lo que
            Tampu maneja, alineado con las categorías estándar de App Store.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border/60 text-left">
                  <th className="py-2 pr-3 font-semibold">Categoría</th>
                  <th className="py-2 pr-3 font-semibold">Recolectada</th>
                  <th className="py-2 pr-3 font-semibold">Linkeada a tu identidad</th>
                  <th className="py-2 font-semibold">Uso</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/40">
                  <td className="py-2 pr-3">Datos de contacto (email)</td>
                  <td className="py-2 pr-3">Sí (modo online)</td>
                  <td className="py-2 pr-3">Sí</td>
                  <td className="py-2">Auth de Supabase</td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 pr-3">Contenido del usuario (notas, reservas, documentos)</td>
                  <td className="py-2 pr-3">Sí</td>
                  <td className="py-2 pr-3">Sí (modo online)</td>
                  <td className="py-2">Funcionalidad de la app</td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 pr-3">Diagnóstico / crash logs</td>
                  <td className="py-2 pr-3">No</td>
                  <td className="py-2 pr-3">No</td>
                  <td className="py-2">N/A</td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 pr-3">Ubicación (precisa o aproximada)</td>
                  <td className="py-2 pr-3">No</td>
                  <td className="py-2 pr-3">No</td>
                  <td className="py-2">N/A</td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 pr-3">Identificadores (Advertising ID, IDFA)</td>
                  <td className="py-2 pr-3">No</td>
                  <td className="py-2 pr-3">No</td>
                  <td className="py-2">N/A</td>
                </tr>
                <tr className="border-b border-border/40">
                  <td className="py-2 pr-3">Datos de uso (clicks, sesiones)</td>
                  <td className="py-2 pr-3">No</td>
                  <td className="py-2 pr-3">No</td>
                  <td className="py-2">N/A</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3">Compras / pagos</td>
                  <td className="py-2 pr-3">No</td>
                  <td className="py-2 pr-3">No</td>
                  <td className="py-2">Tampu no procesa pagos</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            En modo demo (sin Supabase), todas las celdas pasan a No — los datos viven solo en el dispositivo.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-semibold mb-2">8. Borrado de datos</h2>
          <p className="text-sm">
            Modo demo: borrá la app o usá &quot;Resetear datos demo&quot; en Ajustes — borra todo del dispositivo.<br/>
            Modo online: tus datos viven en tu Supabase. Borrá filas o bajá el proyecto entero desde el dashboard de Supabase.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-semibold mb-2">9. Niños</h2>
          <p className="text-sm">Tampu no está dirigido a menores de 13 años y no recolecta datos de ellos.</p>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-semibold mb-2">10. Contacto</h2>
          <p className="text-sm">Preguntas sobre privacidad: <code>privacy@tampu.app</code></p>
        </section>

        <hr className="my-8" />
        <p className="text-xs text-muted-foreground">
          Esta política aplica a la versión 1.0 de Tampu publicada en App Store. Si cambia, anunciaremos dentro de la app
          y actualizaremos esta página antes del cambio.
        </p>
      </main>
    </div>
  );
}
