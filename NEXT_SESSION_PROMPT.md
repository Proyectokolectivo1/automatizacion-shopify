# Prompt para la siguiente sesión

Actualizado: 2026-07-14

Continúa directamente en `C:\Users\Usuario\Documents\Automatizacion Shopify`. El proyecto está
`EN_DESARROLLO`; no está listo para piloto ni producción. E0-H1 a E0-H5C, E0-H4C, E1-H1A a E1-H5A
y E2-H1A a E2-H6A están completas; E0-H3B permanece pendiente. No reinicies ni reemplaces trabajo válido.

Repositorio canónico: <https://github.com/Proyectokolectivo1/automatizacion-shopify>. La rama de
trabajo publicada es `codex/foundations-e0-h2` y el PR borrador #1 está abierto. GitHub CLI 2.96.0
está autenticado mediante keyring. Antes de usar nuevas credenciales, confirmar que el PAT expuesto fue revocado.

## Fuentes obligatorias

Lee completamente antes de editar:

1. `C:\Users\Usuario\Downloads\ESPECIFICACION_MAESTRA_ECOMMERCE_INTELIGENTE.md`.
2. `C:\Users\Usuario\.codex\attachments\209e3c64-68f0-4f6a-b13b-8485a5bb70d8\pasted-text.txt`.
3. `PROJECT_OVERVIEW.md` y los nueve archivos de control.

Actualiza el resumen vivo y todos los controles al cambiar estado, pruebas, riesgos o siguiente paso.

## Baseline obligatorio

Ejecuta `pnpm install --frozen-lockfile`, `pnpm validate`, `pnpm test:integration`,
`pnpm database:verify`, `pnpm outbox:verify`, `pnpm dlq:verify`, `pnpm auth:verify`,
`pnpm identity:verify`, `pnpm shopify:verify`, `pnpm shopify:webhooks:verify`,
`pnpm shopify:orders:verify`, `pnpm orders:classification:verify`,
`pnpm shopify:reconciliation:verify`, `pnpm transport-rates:verify`, `pnpm wompi:verify`,
`pnpm database:status`, `pnpm observability:verify`,
`pnpm audit --prod` y `pnpm infra:verify`. No borres volúmenes.

## Siguiente vertical exacta: E3-H1A

Implementa configuración y proveedor WhatsApp Cloud API únicamente en simulación:

- contrato `WhatsAppProvider`, mock determinista y fixture versionado;
- configuración tenant-safe con identificadores sintéticos y token cifrado/versionado;
- prueba de conexión simulada, ciclo activar/desactivar, auditoría y métricas;
- feature flag, modo simulación y kill switch cerrados por defecto;
- pruebas de contrato, replay, carrera, tenant, rotación y migración desde vacío;
- no enviar mensajes ni registrar plantillas remotas todavía.

Usa la épica E3 y la documentación oficial de WhatsApp únicamente al fijar el contrato público. Meta
real sigue `BLOQUEADO_POR_CREDENCIALES`. No envíes mensajes ni llames Wompi, Shopify, Mastershop o
servicios reales. Conserva la reconciliación E2-H6A sin autocorrecciones.
Mantén E0-H3B pendiente. `pnpm audit --prod` devolvió HTTP 410 por retiro del endpoint npm; no lo
marques verde hasta migrar el gate de forma controlada.
