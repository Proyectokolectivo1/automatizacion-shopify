# Evidencia E0-H4C: operaciones DLQ

Actualizado: 2026-07-14

`pnpm dlq:verify` crea una base PostgreSQL y colas Redis aisladas. Sus cinco casos prueban paginación,
redacción, tenant, RBAC, auditoría, replay de respuesta perdida, carreras con claves distintas,
rechazo de estados no-DLQ, hash de idempotencia y publicación con nueva versión de entrega.

`pnpm outbox:verify` confirma además que el fallo final del worker actualiza evento y ejecución a
`dead_letter`. `pnpm database:verify` aplica las seis migraciones dos veces, valida constraints y
comprueba ausencia de drift.

Incidencias corregidas durante la vertical:

1. BullMQ rechaza `:` en job IDs personalizados; el contrato usa `-v`.
2. El worker debía limpiar `published_at` al cambiar a DLQ para respetar el check SQL.
3. El clock skew host/PostgreSQL dejaba el replay en el futuro; la transición usa `NOW()` de la base.
