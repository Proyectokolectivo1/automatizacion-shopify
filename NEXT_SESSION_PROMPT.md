# Prompt para la siguiente sesión

Actualizado: 2026-07-14

Continúa directamente en `C:\Users\Usuario\Documents\Automatizacion Shopify`. El proyecto está
`EN_DESARROLLO`; no está listo para piloto ni producción. E0-H1 a E0-H5B y E0-H4C están completas.
No reinicies ni reemplaces trabajo válido.

## Fuentes obligatorias

Lee completamente antes de editar:

1. `C:\Users\Usuario\Downloads\ESPECIFICACION_MAESTRA_ECOMMERCE_INTELIGENTE.md`.
2. `C:\Users\Usuario\.codex\attachments\209e3c64-68f0-4f6a-b13b-8485a5bb70d8\pasted-text.txt`.
3. `PROJECT_OVERVIEW.md` y los nueve archivos de control.

Actualiza el resumen vivo y todos los controles al cambiar estado, pruebas, riesgos o siguiente paso.

## Baseline obligatorio

Ejecuta `pnpm install --frozen-lockfile`, `pnpm validate`, `pnpm test:integration`,
`pnpm database:verify`, `pnpm outbox:verify`, `pnpm dlq:verify`, `pnpm auth:verify`,
`pnpm database:status`, `pnpm observability:verify`, `pnpm audit --prod` y `pnpm infra:verify`. No
borres volúmenes.

## Siguiente vertical exacta: E0-H5C

Completa bootstrap y administración de identidad sin proveedor real:

- comando local explícito, idempotente y fail-closed para crear el primer owner solo si no hay users;
- secreto de bootstrap por entorno, nunca en argumentos, logs, respuesta persistida o Git;
- feature flag y kill switch de administración cerrados por defecto;
- listado paginado y mínimo de membresías del tenant autenticado;
- endpoints owner/admin para cambiar roles permitidos y revocar membresías;
- proteger al último owner, auto-revocación peligrosa, escalamiento admin→owner y tenant ajeno;
- invalidar todas las sesiones afectadas al revocar o reducir privilegios;
- idempotency key, resultado repetible y locks para carreras/respuesta perdida;
- auditoría y métricas acotadas sin correo completo, password, token o secreto;
- pruebas PostgreSQL/HTTP de bootstrap doble, carreras, tenant, RBAC y revocación de sesiones;
- contrato, arquitectura, seguridad, runbook, pruebas y todos los controles actualizados.

No habilites correo real: DP-001 sigue `BLOQUEADO_POR_DECISION`. Mantén E0-H3B pendiente. No
implementes registro público, MFA, UI de cookies/CSRF, despliegue ni credenciales reales.
