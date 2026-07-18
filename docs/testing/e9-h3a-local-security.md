# Pruebas E9-H3A

Fecha: 2026-07-18.

- `pnpm security:verify`: 443 archivos candidatos y tres manifests inspeccionados.
- Siete detectores high-confidence pasan self-test sintético; cero coincidencias reales.
- Cero rutas/artefactos prohibidos y `.env`/`.artifacts` correctamente ignorados.
- Versiones directas exactas, cero lifecycle scripts y lockfile/frozen install presentes.
- Cuatro imágenes Compose fijadas, todos los bindings loopback y controles peligrosos ausentes.
- Checkout CI sin credencial persistente, permisos `contents: read` y sin refs de rama flotantes.
- CSP/headers mínimos presentes; `unsafe-eval` limitado a desarrollo.
- `pnpm audit --prod`: 402 dependencias productivas, cero vulnerabilidades conocidas de cualquier
  severidad en la medición.

El reporte enumera limitaciones, no secretos ni fuente. Esto es un baseline local reproducible, no
pentest ni aprobación productiva.
