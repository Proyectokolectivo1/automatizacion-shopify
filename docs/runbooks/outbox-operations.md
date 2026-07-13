# Operación local del outbox

Actualizado: 2026-07-12

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
herramienta de reproceso auditado cuando esa vertical exista. La operación manual de DLQ sigue
pendiente y por ello no se habilita en producción.

En modo real sin adaptador, el worker falla de forma segura y aplica DLQ. No desactive simulación hasta
que exista un adaptador contractual probado y autorizado.
