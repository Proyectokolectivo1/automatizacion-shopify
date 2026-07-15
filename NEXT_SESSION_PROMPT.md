# Prompt para la siguiente sesión

Actualizado: 2026-07-14

Continúa directamente en `C:\Users\Usuario\Documents\Automatizacion Shopify`. El proyecto está
`EN_DESARROLLO`; no está listo para piloto ni producción. E0-H1 a E0-H5C, E0-H4C, E1-H1A a E1-H5A
y E2-H1A/E2-H2A/E2-H3A están completas; E0-H3B permanece pendiente. No reinicies ni reemplaces trabajo válido.

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
`pnpm shopify:reconciliation:verify`, `pnpm database:status`, `pnpm observability:verify`,
`pnpm audit --prod` y `pnpm infra:verify`. No borres volúmenes.

## Siguiente vertical exacta: E2-H4A

Implementa recordatorios Wompi únicamente en simulación:

- agenda durable a 0/8/16/24 horas, máximo dos recordatorios por intención;
- outbox idempotente y cancelación cuando la intención deje `PENDING`;
- política configurable y default-deny para ventanas/estados desconocidos;
- worker/reproceso concurrente, métricas, auditoría, flag, modo simulación y kill switch;
- fixtures y pruebas de carrera, replay, aprobación antes del vencimiento y migración desde vacío.

Usa los contratos Wompi y la sección E2-H4 de la especificación. Wompi real sigue
`BLOQUEADO_POR_CREDENCIALES`. No envíe WhatsApp ni llame Shopify, Mastershop o servicios
reales. Mantén E0-H3B pendiente. `pnpm audit --prod` devolvió HTTP 410 por retiro del endpoint npm;
no lo marque verde hasta migrar el gate de forma controlada.
