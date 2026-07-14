# Runbook de clasificación de pedidos

## Controles

- `ORDER_CLASSIFICATION_ENABLED=false`
- `ORDER_CLASSIFICATION_KILL_SWITCH=true`
- `ORDER_CLASSIFICATION_SIMULATION_MODE=true`

Para pruebas locales se habilita el flag, se desactiva el kill switch y se mantiene simulación. No
usar esta combinación para tráfico real mientras Shopify y las políticas comerciales no estén
aprobadas.

## Diagnóstico

1. Buscar `shopify.order.synchronized.v1` y su `job_executions` por correlation ID.
2. Verificar una sola política activa para la tienda y validar `rules_json` con el contrato v1.
3. Revisar la auditoría `order.payment.classification_failed`; solo expone código acotado.
4. Si agotó reintentos, inspeccionar/reprocesar el evento con la API DLQ tenant-safe existente.
5. No cambiar manualmente `order_state_history`; es inmutable por diseño.

## Kill switch y recuperación

Activar `ORDER_CLASSIFICATION_KILL_SWITCH=true` y reiniciar el worker detiene nuevos efectos. Los
eventos permanecen durables en outbox/DLQ. Corregir política o snapshot, volver a habilitar y
reprocesar un evento de forma acotada. Nunca forzar el estado directamente en la base.
