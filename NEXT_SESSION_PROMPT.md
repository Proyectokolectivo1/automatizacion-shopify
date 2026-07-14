# Prompt para la siguiente sesión

Actualizado: 2026-07-14

Continúa directamente en `C:\Users\Usuario\Documents\Automatizacion Shopify`. El proyecto está
`EN_DESARROLLO`; no está listo para piloto ni producción. E0-H1 a E0-H5C, E0-H4C y E1-H1A a E1-H4A
están completas; E0-H3B permanece pendiente. No reinicies ni reemplaces trabajo válido.

Repositorio canónico: <https://github.com/Proyectokolectivo1/automatizacion-shopify>, rama base
`main`. Antes de usar nuevas credenciales, confirmar que el PAT expuesto en la conversación fue
revocado.

E1-H2A/E1-H3A/E1-H4A están validadas pero aún sin commit en `codex/foundations-e0-h2`, basado en
`origin/main`. Preserva el árbol de trabajo. Para publicarlo, instala/autentica GitHub CLI, crea una
rama `codex/e1-h2a-h3a-shopify-orders`, confirma el alcance, commitea y abre un PR draft; no uses el
PAT expuesto.

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
`pnpm shopify:orders:verify`, `pnpm orders:classification:verify`, `pnpm database:status`, `pnpm observability:verify`,
`pnpm audit --prod` y `pnpm infra:verify`. No borres volúmenes.

## Siguiente vertical exacta: E1-H5A

Implementa conciliación de pedidos únicamente en simulación:

- definir una ventana y cursor persistente por tienda para detectar pedidos faltantes;
- detectar webhooks/pedidos fallidos o atascados sin confundir retraso normal con pérdida;
- permitir reprocesar un caso individual con ownership, RBAC, límite, idempotencia y auditoría;
- reutilizar outbox/DLQ y no mutar estados de pedido directamente;
- evitar regresiones ante eventos tardíos y probar carreras/respuesta perdida;
- añadir métricas, contrato, arquitectura, seguridad, runbook y pruebas PostgreSQL/Redis;
- mantener flags, simulación y kill switch cerrados por defecto.

La API real sigue `BLOQUEADO_POR_CREDENCIALES`. No llames Shopify, Wompi, WhatsApp ni Mastershop;
no habilites dashboard, despliegue o credenciales reales. Mantén E0-H3B pendiente.
