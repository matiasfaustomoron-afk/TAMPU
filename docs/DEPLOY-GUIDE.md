# Travel OS — Guía de Deploy Paso a Paso

Esta guía asume que no sabés nada. Seguí cada paso en orden.

---

## Lo que vas a necesitar

1. **Una computadora** con terminal (Mac: Terminal.app / Windows: PowerShell o WSL)
2. **Node.js 18+** instalado → https://nodejs.org (descargá la versión LTS)
3. **Una cuenta en Supabase** (gratis) → https://supabase.com
4. **Una cuenta en Vercel** (gratis) → https://vercel.com (para ponerlo online)
5. **El archivo travel-os.tar.gz** que ya tenés

---

## PARTE 1: Preparar el proyecto en tu computadora

### Paso 1.1 — Extraer el proyecto

Abrí la terminal y andá a donde tengas el archivo descargado:

```bash
cd ~/Downloads            # o donde lo hayas guardado
tar xzf travel-os.tar.gz  # extrae la carpeta travel-os/
cd travel-os
```

### Paso 1.2 — Instalar dependencias

```bash
npm install
```

Esto tarda 1-2 minutos. Vas a ver mucho texto. Es normal.

### Paso 1.3 — Verificar que funciona en demo

```bash
npm run dev
```

Abrí tu navegador en `http://localhost:3000`. Deberías ver la pantalla de login con un botón "Enter Demo Mode". Si lo ves, todo funciona. Pará el servidor con `Ctrl+C`.

---

## PARTE 2: Crear la base de datos en Supabase

### Paso 2.1 — Crear cuenta y proyecto

1. Andá a **https://supabase.com** y creá una cuenta (podés usar GitHub o email)
2. Hacé click en **"New Project"**
3. Completá:
   - **Name:** `travel-os` (o lo que quieras)
   - **Database Password:** anotalo en un lugar seguro, lo vas a necesitar
   - **Region:** elegí el más cercano a vos (ej: South America si estás en Argentina)
4. Hacé click en **"Create new project"**
5. Esperá 1-2 minutos a que se cree

### Paso 2.2 — Copiar las credenciales

Una vez creado el proyecto:

1. En el menú izquierdo de Supabase, hacé click en **⚙️ Project Settings**
2. Hacé click en **API** (en el submenú)
3. Vas a ver dos valores que necesitás copiar:

```
Project URL:        https://xxxxxxxx.supabase.co     ← copiá esto
anon (public) key:  eyJhbGciOiJIUzI1NiIs...          ← copiá esto
```

**También copiá el "service_role (secret) key"** — lo vas a necesitar para el seed. Este NO va en la app, solo para el script de carga de datos.

### Paso 2.3 — Crear las tablas

1. En el menú izquierdo de Supabase, hacé click en **SQL Editor**
2. Hacé click en **"New query"** (botón arriba a la derecha)
3. Abrí el archivo `src/db/schema.sql` de tu proyecto con cualquier editor de texto
4. Copiá TODO el contenido del archivo
5. Pegalo en el editor SQL de Supabase
6. Hacé click en **"Run"** (botón verde abajo a la derecha)

Deberías ver un mensaje tipo "Success. No rows returned" — eso está bien, creó las tablas.

**Para verificar:** en el menú izquierdo hacé click en **Table Editor**. Deberías ver estas tablas:
- profiles
- trips
- cities
- reservations
- documents
- tasks
- trip_days
- budget_categories
- expenses
- packing_items
- alerts

Si las ves, perfecto. Si no, revisá que hayas copiado TODO el contenido del schema.sql.

---

## PARTE 3: Configurar la app para usar Supabase

### Paso 3.1 — Crear el archivo de configuración

Volvé a tu terminal (en la carpeta travel-os) y ejecutá:

```bash
cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROJECT-URL.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-aqui
EOF
```

**Reemplazá** los valores con los que copiaste en el Paso 2.2.

Ejemplo real (con datos inventados):
```bash
cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTI...
EOF
```

**Importante:** NO debe tener la línea `NEXT_PUBLIC_ENABLE_DEMO_MODE=true`. Si la tiene, borrala.

### Paso 3.2 — Verificar que conecta

```bash
npm run dev
```

Abrí `http://localhost:3000`. Ahora deberías ver la pantalla de login con campos de **Email** y **Password** (no el botón de Demo).

---

## PARTE 4: Crear tu usuario

### Paso 4.1 — Registrarte

1. En la pantalla de login, hacé click en **"Sign up"**
2. Ingresá un email y password
3. Hacé click en **"Sign Up"**

**Alternativa** (si el signup por email requiere confirmación):

1. Andá a **Supabase Dashboard → Authentication → Users**
2. Hacé click en **"Add user"** → **"Create new user"**
3. Ingresá email y password
4. Tildá **"Auto Confirm User"**
5. Hacé click en **"Create user"**
6. Ahora podés loguearte en la app con esas credenciales

### Paso 4.2 — Obtener tu User ID

Lo necesitás para cargar los datos de ejemplo.

1. En **Supabase Dashboard → Authentication → Users**
2. Hacé click en tu usuario
3. Copiá el **UID** (es un string tipo `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

---

## PARTE 5: Cargar los datos del viaje

### Paso 5.1 — Ejecutar el seed

En tu terminal (en la carpeta travel-os):

```bash
SUPABASE_URL=https://TU-PROJECT-URL.supabase.co \
SUPABASE_SERVICE_KEY=tu-service-role-key \
USER_ID=tu-user-id \
node src/db/seed-runner.mjs
```

Reemplazá:
- `SUPABASE_URL` → la misma URL del paso 2.2
- `SUPABASE_SERVICE_KEY` → el **service_role (secret) key** del paso 2.2 (NO el anon key)
- `USER_ID` → el UID del paso 4.2

**Ejemplo real:**
```bash
SUPABASE_URL=https://abcdefghijk.supabase.co \
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIs... \
USER_ID=a1b2c3d4-e5f6-7890-abcd-ef1234567890 \
node src/db/seed-runner.mjs
```

Deberías ver algo así:
```
Seeding Travel OS...

  ✓ trips: 1 rows
  ✓ cities: 8 rows
  ✓ budget_categories: 12 rows
  ✓ reservations: 7 rows
  ✓ expenses: 3 rows
  ✓ tasks: 30 rows
  ✓ documents: 13 rows
  ✓ packing_items: 32 rows
  ✓ trip_days: 24 rows

✅ Seed complete!
```

### Paso 5.2 — Verificar en la app

```bash
npm run dev
```

1. Abrí `http://localhost:3000`
2. Logueate con tu email y password
3. Deberías ver el **Dashboard** con datos reales: presupuesto, tareas, alertas, countdown

Si ves el dashboard con datos → **tu app ya está online con Supabase como base de datos real**.

---

## PARTE 6: Ponerlo online en Vercel (acceder desde cualquier dispositivo)

### Paso 6.1 — Subir a GitHub

Primero necesitás el código en GitHub:

1. Andá a **https://github.com** y logueate (o creá una cuenta)
2. Hacé click en **"+"** → **"New repository"**
3. Nombre: `travel-os`, privado
4. NO marques "Add README" (ya lo tenés)
5. Hacé click en **"Create repository"**

En tu terminal:

```bash
cd ~/Downloads/travel-os   # o donde tengas el proyecto
git init
git add .
git commit -m "Travel OS MVP"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/travel-os.git
git push -u origin main
```

Reemplazá `TU-USUARIO` con tu nombre de usuario de GitHub.

### Paso 6.2 — Deployar en Vercel

1. Andá a **https://vercel.com** y logueate con tu cuenta de GitHub
2. Hacé click en **"Add New..."** → **"Project"**
3. Buscá `travel-os` en la lista de repos y hacé click en **"Import"**
4. En **"Environment Variables"**, agregá estas dos:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://tu-project.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGci...` (tu anon key) |

5. Hacé click en **"Deploy"**
6. Esperá 2-3 minutos

Cuando termine, Vercel te da una URL tipo `https://travel-os-xxxxx.vercel.app`. Esa es tu app online.

### Paso 6.3 — Configurar Supabase para Vercel

Necesitás decirle a Supabase que acepte requests desde tu URL de Vercel:

1. En **Supabase Dashboard → Authentication → URL Configuration**
2. En **Site URL**, poné tu URL de Vercel: `https://travel-os-xxxxx.vercel.app`
3. En **Redirect URLs**, agregá: `https://travel-os-xxxxx.vercel.app/api/auth/callback`
4. Hacé click en **"Save"**

---

## PARTE 7: Acceder desde el celular

1. Abrí tu navegador del celular
2. Andá a `https://travel-os-xxxxx.vercel.app` (tu URL de Vercel)
3. Logueate con tu email y password
4. En iPhone: Safari → botón compartir → "Add to Home Screen"
5. En Android: Chrome → menú (⋮) → "Add to Home screen"

Ahora tenés la app como ícono en tu celular.

---

## Resumen de URLs y credenciales que necesitás guardar

| Qué | Dónde está |
|-----|------------|
| Supabase Project URL | Supabase Dashboard → Settings → API |
| Supabase Anon Key | Supabase Dashboard → Settings → API |
| Supabase Service Key | Supabase Dashboard → Settings → API (oculto, no compartir) |
| Tu User ID | Supabase Dashboard → Authentication → Users |
| Database Password | Lo que elegiste al crear el proyecto |
| URL de tu app | Lo que te da Vercel después del deploy |
| Email + Password | Lo que usaste para registrarte en la app |

---

## Problemas comunes

**"Supabase not configured" en login:**
→ Revisá que `.env.local` tenga las variables correctas. Reiniciá con `npm run dev`.

**"Invalid login credentials":**
→ Andá a Supabase → Authentication → Users y verificá que tu usuario exista y esté confirmado.

**Dashboard vacío después de login:**
→ Corriste el seed? Verificá en Supabase → Table Editor → trips que haya datos.

**Error "Failed to fetch" o "Network error":**
→ Verificá que la URL de Supabase en `.env.local` sea correcta (con `https://`).

**Seed script falla con "not authorized":**
→ Estás usando el `anon key` en vez del `service_role key`. El seed necesita el service role.

**La app funciona local pero no en Vercel:**
→ Verificá que las environment variables estén configuradas en Vercel (Settings → Environment Variables). Después hacé "Redeploy" desde Vercel dashboard.

---

## PARTE 8: Document Vault (opcional)

Si querés usar la función de subir archivos (boarding passes, seguros, etc.):

### Paso 8.1 — Crear bucket de storage

1. En Supabase Dashboard → **Storage**
2. Hacé click en **"New bucket"**
3. Nombre: `travel-vault`
4. **NO** marques "Public bucket" (debe ser privado)
5. Click en **"Create bucket"**

### Paso 8.2 — Crear policy de storage

1. Hacé click en el bucket `travel-vault`
2. Andá a la pestaña **"Policies"**
3. Click **"New policy"** → **"For full customization"**
4. Nombre: `user_files`
5. Operations: SELECT, INSERT, DELETE
6. Policy: `(auth.uid())::text = (storage.foldername(name))[1]`
7. Click **"Save"**

Esto asegura que cada usuario solo accede a sus propios archivos.

---

## PARTE 9: Idioma

La app soporta **Español** e **English**.

- En la pantalla de login hay un selector de idioma
- En Ajustes también podés cambiarlo
- Las fechas y monedas se formatean según el idioma seleccionado
- El idioma se guarda en tu navegador y persiste entre sesiones
