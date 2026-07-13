# Outbox transaccional y workers

Actualizado: 2026-07-12

La base de datos es la fuente de verdad. `FoundationTransactionService` escribe el agregado de
demostración, la clave idempotente y `outbox_events` dentro de una transacción serializable. Una
respuesta perdida se recupera desde `response_snapshot_json`; reutilizar la clave con otro payload
produce conflicto.

El publisher reclama lotes con `FOR UPDATE SKIP LOCKED`, marca un lease y publica en BullMQ usando el
UUID del evento como `jobId`. Solo después confirma el estado `published`. Si Redis falla, el evento
queda `failed`, con backoff y error clasificado sin copiar mensajes potencialmente sensibles. Un lease
vencido permite recuperar un proceso interrumpido.

El consumidor corre como proceso separado. BullMQ aplica reintentos exponenciales acotados; el último
fallo se registra en `job_executions` y se copia a la cola DLQ. Los jobs completados y fallidos se
retienen por tiempo/cantidad para conservar deduplicación y diagnóstico.

Los flags por defecto son seguros: publisher desactivado, kill switch activo y simulación activa. La
vertical no invoca proveedores externos ni expone el agregado de demostración por HTTP.
