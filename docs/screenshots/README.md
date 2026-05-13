# App Store Screenshots

30 PNGs generados automáticamente via Playwright + Chromium en modo mobile emulation, contra el production server real.

```
docs/screenshots/
  iphone-6.7/   (1290×2796 — iPhone 15 Pro Max)
  iphone-6.5/   (1242×2688 — iPhone 11 Pro Max)
  iphone-5.5/   (1242×2208 — iPhone 8 Plus)
```

Cada directorio contiene los 10 frames del recorrido:
1. `01-dashboard.png` — Command Center hero
2. `02-today.png` — vivencia del día
3. `03-cashflow.png` — gráficos diario + semanal + por destino
4. `04-risk.png` — risk register 5 dominios
5. `05-decisions.png` — open decisions priorizadas
6. `06-map.png` — mapa interactivo Leaflet+OSM
7. `07-health.png` — vacunas CDC + malaria
8. `08-visas.png` — wizard de visas verificadas
9. `09-emergency.png` — SOS multipaís + seguro
10. `10-assistant.png` — Asistente IA con respuesta

## Regenerar

```bash
npm run build && PORT=3030 npm run start &  # background
npm run screenshots
```

## Subir a App Store Connect

En App Store Connect → My App → 1.0 Prepare for Submission → Screenshots:

- **iPhone 6.7" Display** → subir `iphone-6.7/*.png` (10 frames)
- **iPhone 6.5" Display** → subir `iphone-6.5/*.png` (10 frames)
- **iPhone 5.5" Display** → subir `iphone-5.5/*.png` (10 frames)

Orden: empezar por `01-dashboard` (el hero) — App Store muestra los primeros 3-4 en search results.

## Custom edits

Si necesitás polish manual (overlay con marca, gradientes), edita `scripts/screenshots.mjs` función `overlayTitleHTML()` o post-procesá con Sketch/Figma/Photoshop. El layout base es A4-compatible.

## Validation Apple

Apple chequea:
- Tamaños exactos por dispositivo (✓ ya cumple)
- No marketing language con badges ("Best app!" "Free!" — prohibido)
- Real product UI (✓ son screenshots reales del demo mode)
- No status bar de Android / no chrome de browser visible (✓ Chromium mobile emulation oculta browser chrome)

Si Apple rechaza un screenshot por "doesn't reflect the app" — el reviewer probablemente vió un texto que no corresponde a la versión submitted. Re-generar después de cualquier cambio mayor de UI.
