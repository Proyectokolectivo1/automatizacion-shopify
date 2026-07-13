# Prompt para la siguiente sesión

Continúa directamente en `C:\Users\Usuario\Documents\Automatizacion Shopify`. El proyecto está
`EN_DESARROLLO`; no está listo para piloto ni producción. E0-H1 y E0-H2 están completas. No reinicies
ni reemplaces trabajo válido.

## Fuentes obligatorias

Lee completamente antes de editar:

1. `C:\Users\Usuario\Downloads\ESPECIFICACION_MAESTRA_ECOMMERCE_INTELIGENTE.md`.
2. `C:\Users\Usuario\.codex\attachments\209e3c64-68f0-4f6a-b13b-8485a5bb70d8\pasted-text.txt`
   (prompt maestro suministrado).
3. Los nueve archivos de control del repositorio, empezando por `PROJECT_STATUS.md`,
   `IMPLEMENTATION_PLAN.md` y este archivo.

## Baseline obligatorio

1. Ejecuta `git status --short --branch` y revisa cambios existentes.
2. Confirma Node/pnpm/Docker y ejecuta `docker info`.
3. Ejecuta `pnpm install --frozen-lockfile`, `pnpm validate`, `pnpm audit --prod` y
   `pnpm infra:verify`.
4. No borres volúmenes ni uses `docker compose down -v`.

## Siguiente vertical exacta: E0-H3

Implementa observabilidad base en la API:

- Pino con logs JSON y redacción de secretos/PII;
- generación y propagación de `correlationId`;
- respuesta con header de correlación;
- filtro global de errores sin filtrar detalles internos;
- métricas mínimas y readiness de PostgreSQL, Redis y MinIO;
- pruebas unitarias e integración aplicables;
- runbook y contrato documentado.

No implementes todavía modelos de negocio, Prisma/outbox, BullMQ, autenticación ni integraciones
reales. Repite formatter, lint, typecheck, tests, build, audit y smoke tests. Actualiza todos los
archivos de control.

Bloqueos vigentes: Shopify/Wompi/Meta por credenciales, Mastershop por proveedor e impresión por
inventario. MinIO comunitario está prohibido para producción por archivo archivado y CVE-2026-33322.
No despliegues, no ejecutes operaciones destructivas y no declares el proyecto terminado.
