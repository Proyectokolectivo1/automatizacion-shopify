# Pruebas E6-H1A — cola operativa

Actualizado: 2026-07-17

## Cobertura dedicada

- Unificación de los cinco tipos y política de atención v1.
- Proyección mínima, referencias internas y ausencia de PII/IDs externos.
- Paginación keyset estable ante una inserción concurrente más reciente.
- Filtros por tipo, estado, tienda, atención y rango temporal.
- Query/cursor inválidos, RBAC, tenant ajeno y kill switch fail-closed.
- Auditoría, métrica y cinco índices tenant+timestamp+UUID.

## Evidencia al implementar

- `pnpm operations:verify`: 5/5.
- `pnpm database:verify`: 15/15, 28 migraciones y cero drift.
- `pnpm validate`: 20 archivos, 73 pruebas unitarias, cobertura crítica al 100 %, lint, tipos y
  builds verdes.
- Regresión: auth 14/14, identidad 5/5, DLQ 5/5, outbox 4/4, Shopify 20/20 entre gates,
  clasificación 4/4, tarifas 3/3, Wompi 21/21, WhatsApp 25/25 e integración base 3/3.

La primera ejecución dedicada detectó un fixture de conversación desconocida que violaba la forma
de privacidad ya reforzada en PostgreSQL. Se corrigió el fixture creando un cliente sintético y no se
relajó el constraint. Una ejecución paralela posterior de suites chocó al regenerar Prisma sobre el
mismo directorio; los gates oficiales se ejecutaron en serie y pasaron.
