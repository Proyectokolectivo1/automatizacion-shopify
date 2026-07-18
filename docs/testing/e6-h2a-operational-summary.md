# Pruebas E6-H2A — resumen operativo

Actualizado: 2026-07-17

## Cobertura dedicada

- Conteos totales y desgloses por cinco tipos/estados sobre la atención v1 compartida.
- Ventana `[from,to)` obligatoria y máxima de 31 días.
- Filtros por tipo/tienda y respuesta canónica sin resultados.
- Fechas, campos, tipos y UUID inválidos.
- RBAC, tenant ajeno, kill switch, auditoría, métrica, `no-store` y ausencia de PII.
- Cola E6-H1A intacta después de centralizar el read model.

## Evidencia inicial

- `pnpm operations:verify`: 7/7.
- Typecheck y lint API: verdes.
- PostgreSQL real: una consulta `UNION ALL` + `GROUPING SETS`, sin migración nueva.

La regresión completa y los gates operativos se registran en `TEST_REPORT.md` al cerrar la vertical.
