# Tampu — Security Checklist

Checklist de prácticas mínimas para no leakear secrets. Auditor externo
(mayo 2026) levantó este flag y este doc + `scripts/audit-secrets.cjs` +
`.husky/pre-commit` son la respuesta defensa-en-profundidad.

## Qué NUNCA va al repo

Estos archivos / valores nunca deben aparecer en `git status` antes de un
commit. Si los ves, **paralizá el commit** y rotá el secret correspondiente.

- `.env`, `.env.local`, `.env.production`, `.env.development` — solo
  `.env.example` está permitido (template público sin valores reales).
- API keys de cualquier proveedor:
  - Anthropic: `sk-ant-api...` / `sk-ant-admin...`
  - Google: `AIza...`
  - OpenAI: `sk-...` (excepto `sk-ant-*` que es Anthropic)
  - Supabase: `sb_secret_...`, `sb_publishable_...`, y JWTs `eyJhbGc...`
    (especialmente la `service_role`).
  - AWS: `AKIA...` access keys + sus secret pairs.
  - Slack: `xoxb-...`, `xoxp-...`, etc.
- Archivos `*.pem`, `*.key` (private keys).
- `credentials.json` (Google Cloud, Firebase, etc).
- Archivos `*.bak`, `*.old` — históricamente son la vía por la que un dev
  guarda un dump de `.env` "por las dudas".
- `.vercel/` y `.netlify/` directories (contienen tokens de deploy).
- iOS provisioning profiles `*.mobileprovision` y signing certs `*.p12`.

## Cómo agregar un secret nuevo

Cuando necesitamos integrar un proveedor nuevo (ej. agregar Stripe, Heymondo,
Wise API, etc):

1. **Decidí dónde vive el secret**:
   - Si es **client-side** (visible al user): usar `NEXT_PUBLIC_*` y aceptar
     que es público de facto. Solo para keys publishable (Stripe pub key,
     Supabase anon key).
   - Si es **server-side**: nunca con prefijo `NEXT_PUBLIC_*`. Va en Vercel
     env vars (deploy) y en `.env.local` (dev). Nunca hardcoded.
2. **Documentá la variable en `.env.example`** con su nombre, valor dummy y
   un comentario corto de qué hace. El próximo dev (o vos en 3 meses) lo va
   a necesitar.
3. **Si el secret tiene formato detectable por regex**, agregalo a
   `scripts/audit-secrets.cjs` (sección PATTERNS). Testealo contra 3 strings
   reales que SÍ deberían matchear y 3 que NO antes de commitear el cambio.
4. **Rotación**: anotá la fecha de creación + último uso en una nota privada
   (no en el repo). Rotá keys cada 90 días o ante cualquier sospecha de leak.
5. **Acceso**: solo gente que necesita el secret debe tenerlo. Compartilo
   por 1Password (o equivalente), nunca por Slack/WhatsApp/email.

## Si leakeás un secret

Aunque tengamos pre-commit, accidentes pasan (ej. `--no-verify` por error,
clone de un repo histórico con leak, push de un dump de logs). Si te pasa:

1. **Rotá la key inmediatamente** — no esperes a "ver qué pasa". Los
   bots scrapean GitHub público en minutos.
2. **Revocá la key vieja** en el dashboard del proveedor.
3. **No rebases para "borrar" el commit** si ya hiciste push. La key vive
   en el historial de cualquiera que haya clonado el repo y en el reflog de
   GitHub. La única defensa real es revocar.
4. **Notificá al equipo** — si la key tenía permisos elevados (Supabase
   service_role, AWS admin), asumí compromiso y revisá logs del proveedor.

## Auditoría

Corré el scanner manualmente cada tanto para asegurarte de que el repo está
limpio:

```bash
npm run audit:secrets
```

El pre-commit hook (`.husky/pre-commit`) ya lo corre sobre los archivos
staged en cada commit. Si necesitás bypass por una emergencia documentada:
`git commit --no-verify` — pero acordate que es excepcional, no la norma.

## Por qué este setup y no otra cosa

- **No git-secrets**: requiere Python instalado, no garantizado en Windows
  ni en CI minimalistas. Nuestro script es Node.js puro (la toolchain que
  ya tenemos para Next.js).
- **No trufflehog/gitleaks como dep**: son herramientas excelentes pero
  agregan toolchain pesada y requieren install separado. Para una app que
  todavía no llegó a producción consumer, el ROI no justifica el peso.
- **Husky**: ~700KB, estándar 2026, da una API consistente cross-platform
  para hooks. La alternativa (`.git/hooks/pre-commit` a pelo) no se versiona
  con el repo y se pierde en cada clone fresh.
- **Pre-commit, no pre-push**: queremos el feedback inmediato cuando el dev
  todavía está en el flow. Pre-push llega muy tarde — la key ya vivió en
  el branch local y puede haber sido pusheada a un fork.
