# Prompt para la siguiente sesión

Actualizado: 2026-07-14

Continúa directamente en `C:\Users\Usuario\Documents\Automatizacion Shopify`. El proyecto está
`EN_DESARROLLO`; no está listo para piloto ni producción. E0-H1 a E0-H5C, E0-H4C y E1-H1A a E1-H5A
están completas; E0-H3B permanece pendiente. No reinicies ni reemplaces trabajo válido.

Repositorio canónico: <https://github.com/Proyectokolectivo1/automatizacion-shopify>. La rama de
trabajo publicada es `codex/foundations-e0-h2`. GitHub CLI no está instalado; el PR puede abrirse en
la interfaz web. Antes de usar nuevas credenciales, confirmar que el PAT expuesto fue revocado.

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
`pnpm shopify:reconciliation:verify`, `pnpm database:status`, `pnpm observability:verify`,
`pnpm audit --prod` y `pnpm infra:verify`. No borres volúmenes.

## Siguiente vertical exacta: E2-H1A

Implementa reglas de tarifas y modalidades de pago únicamente en simulación:

- modelo versionado y tenant-safe por tienda, con vigencia y una política activa inequívoca;
- reglas priorizadas y deterministas para modalidad, tarifa y evidencia requerida;
- decisión default-deny ante ausencia, contradicción, moneda o regla desconocida;
- API de preview/activación con RBAC, idempotencia, auditoría y límites si la especificación la exige;
- fixtures y pruebas de contrato, replay, carrera, tenant, redacción y migración desde vacío;
- flags, modo simulación y kill switch cerrados por defecto.

Wompi real sigue `BLOQUEADO_POR_CREDENCIALES`. No cree links de pago, no envíe WhatsApp y no llame
Shopify, Mastershop ni servicios reales. Mantén E0-H3B pendiente.
