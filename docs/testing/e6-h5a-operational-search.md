# Pruebas E6-H5A

Fecha: 2026-07-18.

- `pnpm operations:verify`: 9/9 sobre PostgreSQL/HTTP; cubre ID exacto, estado exacto, ranking,
  paginación, cursor ligado a consulta, ventanas, filtros, PII, RBAC, tenant, auditoría, métrica y kill
  switch.
- `pnpm web:verify`: 9/9; cubre la ruta BFF de búsqueda y confirma que `itemId`, `matchKind`, tenant,
  email y tokens no llegan al navegador.
- `pnpm validate`: 82 pruebas totales, 20 archivos/73 pruebas API con cobertura crítica al 100 %, 9
  pruebas web, lint, tipos y builds verdes.

El primer cierre detectó `no-control-regex` en la validación de `q`; se sustituyó por comprobación
explícita de code points y el gate completo pasó al repetir. No hubo migración nueva.
