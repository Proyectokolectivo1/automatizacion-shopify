# Prompt para la siguiente sesión

Continúa directamente en `C:\Users\Usuario\Documents\Automatizacion Shopify`. El proyecto está
`EN_DESARROLLO`; no está listo para piloto ni producción. E0-H1 a E0-H5B están completas. No
reinicies ni reemplaces trabajo válido.

## Fuentes obligatorias

Lee completamente antes de editar:

1. `C:\Users\Usuario\Downloads\ESPECIFICACION_MAESTRA_ECOMMERCE_INTELIGENTE.md`.
2. `C:\Users\Usuario\.codex\attachments\209e3c64-68f0-4f6a-b13b-8485a5bb70d8\pasted-text.txt`.
3. `PROJECT_OVERVIEW.md` y los nueve archivos de control.

Actualiza el resumen vivo y todos los controles al cambiar estado, pruebas, riesgos o siguiente paso.

## Baseline obligatorio

Ejecuta `pnpm install --frozen-lockfile`, `pnpm validate`, `pnpm test:integration`,
`pnpm database:verify`, `pnpm outbox:verify`, `pnpm auth:verify`, `pnpm database:status`,
`pnpm observability:verify`, `pnpm audit --prod` y `pnpm infra:verify`. No borres volúmenes.

## Siguiente vertical exacta: E0-H4C

Completa operaciones seguras de DLQ sin proveedor real:

- migración expand-only para ownership organizacional explícito y trazable de outbox/jobs;
- backfill seguro de filas existentes de desarrollo y constraints/indexes compatibles con despliegue;
- endpoints paginados para inspeccionar únicamente eventos DLQ del tenant autenticado;
- endpoint owner/admin para reprocesar un evento DLQ, con idempotency key y resultado repetible;
- transición atómica `dead_letter → pending`, limpieza controlada de lease/error y nuevo intento auditable;
- protección contra tenant ajeno, rol insuficiente, evento no-DLQ y carreras concurrentes;
- feature flag y kill switch operativos cerrados por defecto;
- payload resumido/redactado: no devolver ni registrar secretos o PII completa;
- auditoría y métricas acotadas para consulta, éxito, replay, denegación y fallo;
- pruebas PostgreSQL/Redis/HTTP de paginación, tenant, RBAC, respuesta perdida, replay y concurrencia;
- actualización de contrato, arquitectura, seguridad, runbook, pruebas y todos los controles.

No habilites correo real: DP-001 sigue `BLOQUEADO_POR_DECISION`. Mantén E0-H3B pendiente. No
despliegues ni uses credenciales reales.
