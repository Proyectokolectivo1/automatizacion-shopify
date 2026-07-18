# Pruebas E6-H6A

Fecha: 2026-07-18.

- `pnpm operations:verify`: 11/11 PostgreSQL/HTTP; cinco tipos, timeline, PII, RBAC, tenant, 404,
  entradas inválidas, auditoría, métrica y kill switch.
- `pnpm web:verify`: 11/11; cifrado, expiración, alteración, tenant, resolución BFF y ausencia de UUID,
  referencia, email y organización en la respuesta.
- `pnpm validate`: 84 pruebas totales; API 20 archivos/73 pruebas al 100 % crítico, web 11/11, lint,
  tipos y builds verdes.
- `pnpm database:verify`: 16/16, 30/30 migraciones y cero drift; E6-H6A no añade migración.

Incidencias corregidas: Docker Desktop detenido impedía iniciar PostgreSQL; el teardown integrado ahora
tolera setup incompleto. Una expectativa seleccionaba un pedido concurrente por orden incidental y se
cambió a su timeline observable. No se deshabilitaron validaciones ni pruebas.
