# Pruebas E6-H7A

Fecha: 2026-07-18.

- `pnpm operations:verify`: 12/12; límite/truncado/orden/filtro, RBAC owner-only, tenant, PII, 7 días,
  1.000 filas, rate limit, auditoría, métrica y kill switch.
- `pnpm web:verify`: 13/13; CSV RFC 4180, BOM/CRLF, fórmula con espacios, headers attachment/no-store,
  tenant derivado y ausencia de secretos/IDs.
- `pnpm database:verify`: 16/16, 30/30 y cero drift; sin migración nueva.
- `pnpm infra:verify`: protocolos, health y persistencia tras recreación verdes.

El primer `pnpm validate` de cierre encontró exclusivamente formato en tres documentos de E6-H6A;
se aplicó Prettier y se repitió el gate completo. No se relajaron pruebas ni lint.
