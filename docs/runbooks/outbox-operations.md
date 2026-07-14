# Operación local del outbox

Actualizado: 2026-07-14

## Validación aislada

Ejecute `pnpm outbox:verify`. La suite crea una base PostgreSQL temporal y nombres de cola aleatorios,
prueba concurrencia, rollback, Redis inaccesible, recuperación, reintentos y DLQ, y elimina sus
recursos al terminar. No modifica la base de desarrollo.

## Activación controlada

1. Mantenga `OUTBOX_SIMULATION_MODE=true`.
2. Cambie `OUTBOX_KILL_SWITCH=false` y `OUTBOX_PUBLISHER_ENABLED=true` solo en un entorno local.
3. Compile con `pnpm build`.
4. Inicie API y worker como procesos separados.
5. Observe `ecommerce_api_outbox_events_total` y las tablas `outbox_events`/`job_executions`.

Para detener entrega nueva, active `OUTBOX_KILL_SWITCH=true` y reinicie los procesos. No elimine jobs
ni cambie estados a mano. Después de un incidente, conserve evidencia, corrija la causa y use una
API de reproceso auditado solo después de corregir la causa.

## Inspección y reproceso de DLQ

1. Mantenga `OUTBOX_OPERATIONS_ENABLED=false` y `OUTBOX_OPERATIONS_KILL_SWITCH=true` por defecto.
2. En un entorno autorizado, habilite el flag y abra el kill switch; reinicie la API.
3. Use una sesión OWNER/ADMIN y `GET /operations/organizations/{organizationId}/dlq?limit=25`.
4. Guarde el `eventId`; la respuesta no incluye payload ni PII completa.
5. Corrija primero la causa y envíe `POST .../dlq/{eventId}/reprocess` con `Idempotency-Key` única.
6. Ante respuesta perdida, repita exactamente la misma clave: la respuesta y el efecto se conservan.
7. Verifique auditoría, `ecommerce_api_outbox_operations_total` y la nueva versión de entrega.

Active inmediatamente el kill switch ante reprocesos inesperados. Nunca cambie estados con SQL ni
reutilice otra clave para el mismo evento ya pendiente. Ejecute `pnpm dlq:verify` tras cambios.

En modo real sin adaptador, el worker falla de forma segura y aplica DLQ. No desactive simulación hasta
que exista un adaptador contractual probado y autorizado.
