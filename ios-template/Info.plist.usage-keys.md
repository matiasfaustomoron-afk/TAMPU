# Tampu — iOS Info.plist usage keys (canónicas, justificadas para App Review)

Después de `npx cap add ios`, abrí `ios/App/App/Info.plist` (o en Xcode) y agregá / verificá estas keys. **Los textos están redactados para pasar revisión de Apple (5.1.1 — Data Use & Sharing y 5.1.2 — Data Use & Sharing).**

Cada texto cumple con tres reglas de App Review:
1. Explica POR QUÉ pedimos el permiso (no genérico).
2. El usuario reconoce el contexto exacto.
3. NO menciona features que no existen.

---

## Permisos solicitados — Capacitor plugins ya en `package.json`

| Plugin Capacitor                           | Key Info.plist                            | Value (ES) — copy a usar |
| ------------------------------------------ | ----------------------------------------- | ------------------------ |
| `@capacitor/camera`                        | `NSCameraUsageDescription`                | "Tampu usa la cámara cuando elegís escanear un boarding pass, pasaporte u otro documento para guardarlo en tu Cartera offline." |
| `@capacitor/camera` (galería)              | `NSPhotoLibraryUsageDescription`          | "Tampu accede a tu librería de fotos cuando elegís adjuntar una imagen de una reserva o pase a tu Cartera." |
| `@capacitor/camera` (guardar)              | `NSPhotoLibraryAddUsageDescription`       | "Tampu puede guardar un documento de tu Cartera de vuelta en Fotos cuando vos pedís compartirlo o exportarlo." |
| `@capacitor/geolocation`                   | `NSLocationWhenInUseUsageDescription`     | "Tampu usa tu ubicación solo cuando abrís el mapa del viaje, para centrar la vista. No se guarda ni se envía a servidores." |
| `@capacitor/local-notifications`           | (no requiere key — usuario aprueba por prompt nativo) | — |
| `@capacitor/push-notifications`            | (no requiere key — el prompt nativo basta) | — |
| `@capacitor/filesystem`                    | (no requiere key — sandboxed) | — |
| `@capacitor/share`                         | (no requiere key) | — |
| `@capacitor/haptics`                       | (no requiere key) | — |

---

## Permisos a NO declarar (declarar de menos es seguro)

Tampu **NO** usa:

- Bluetooth → no agregar `NSBluetoothAlwaysUsageDescription`
- Micrófono → no agregar `NSMicrophoneUsageDescription`
- HealthKit / Salud → no agregar `NSHealthShareUsageDescription`
- Contactos → no agregar `NSContactsUsageDescription`
- FaceID/TouchID → no agregar `NSFaceIDUsageDescription` (a futuro, si bloqueamos la Cartera con biometría, agregar acá)
- Background location → NO agregar `NSLocationAlwaysAndWhenInUseUsageDescription`
- Tracking ATT → NO agregar `NSUserTrackingUsageDescription` (Tampu no trackea)

---

## App Privacy answers (App Store Connect)

Cuando submeas, responder así en App Privacy:

| Pregunta de App Store Connect | Respuesta |
| ------------------------------ | --------- |
| ¿La app recolecta datos?       | **Sí** (modo online) / **No** (modo demo standalone) |
| Diagnostics                    | No |
| Identifiers                    | No |
| Location                       | No (la lectura via Geolocation es device-only, no se sube) |
| Contact Info — Email           | Sí, linkeado al usuario (auth Supabase) |
| User Content                   | Sí, linkeado al usuario (reservas, gastos, documentos) |
| Usage Data                     | No |
| Purchases                      | No |
| Search History                 | No |
| Browsing History               | No |
| Financial Info                 | No (los montos de gastos NO son cuentas bancarias) |
| Health & Fitness               | No |
| Sensitive Info                 | No |
| Other Data                     | No |

**Tracking**: NO. Tampu no trackea.

**Data Used to Track You**: vacío.

**Privacy Policy URL**: `https://<tampu-domain>/privacy`

---

## Encryption Export Compliance

`ITSAppUsesNonExemptEncryption` = **NO**.

Razón: Tampu solo usa HTTPS estándar (todo el tráfico va por la WebView de iOS sobre TLS del sistema) y `crypto.randomUUID()` para IDs. No usa criptografía propia ni almacena claves criptográficas no-exentas.

---

## CFBundleDisplayName / CFBundleName

```
CFBundleDisplayName  = Tampu
CFBundleName         = Tampu
```

(Cambio del legacy "Travel OS" — verificar en Target → General → Display Name antes de submitear.)

---

## Última verificación antes de submit

- [ ] Privacy Policy URL apunta a `/privacy` (live, no localhost)
- [ ] Las 4 keys de usage descriptions presentes y en español
- [ ] `CFBundleDisplayName` = "Tampu"
- [ ] App icon 1024×1024 sin transparencia (Apple lo rechaza si tiene alfa)
- [ ] Screenshots de 5 tabs en device frames 6.7" y 6.5"
- [ ] Demo account credentials para Apple en Review Notes (si Supabase auth está activo)
