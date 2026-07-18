# Pruebas E6-H4A

Comando dedicado: `pnpm alerts:verify`.

La suite crea una base PostgreSQL temporal, aplica todas las migraciones y cubre:

- catálogo de cinco reglas v1 sin SLA/severidad;
- creación por scheduler en lote acotado;
- repetición concurrente sin duplicados;
- persistencia tras reiniciar la aplicación;
- resolución idempotente y nuevo ciclo al reaparecer atención;
- lectura con filtros, cursor y proyección sin PII;
- owner/operations permitidos, support/read-only denegados y aislamiento tenant;
- flag/kill switch fail-closed, auditoría y métrica acotada.

`pnpm database:verify` cubre además constraints, índice parcial de dedupe, despliegue desde vacío,
reaplicación no-op y ausencia de drift. `pnpm operations:verify` protege el read model compartido.
