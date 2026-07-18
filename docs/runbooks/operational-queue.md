# Runbook — cola operativa

Actualizado: 2026-07-17

## Controles

- `OPERATIONAL_QUEUE_ENABLED=false`
- `OPERATIONAL_QUEUE_KILL_SWITCH=true`

Para una prueba local controlada, habilitar el feature y abrir el kill switch. No modificar los
controles de los dominios fuente: esta ruta solo lee datos durables.

## Diagnóstico

- `400`: descartar filtros desconocidos, validar UUID/ISO-8601 y reiniciar desde la primera página si
  el cursor fue alterado.
- `401`: renovar la sesión.
- `403`: comprobar organización y que el rol sea owner/admin/operations.
- `503`: revisar feature flag y kill switch; no consultar tablas manualmente para eludir el control.
- Elemento ausente: comprobar `requiresAttention` (por defecto `true`), ventana temporal, tipo,
  estado y tienda.

La métrica `ecommerce_api_operational_queue_operations_total{action,outcome}` observa lecturas sin
alta cardinalidad. Correlacionar con auditoría `operations.queue.listed` usando IDs internos; nunca
copiar PII o payloads al incidente.

## Verificación

Ejecutar `pnpm operations:verify`, `pnpm database:verify`, `pnpm validate` y los gates funcionales en
serie. Confirmar `pnpm database:status` en 28/28. Para rollback operativo, activar el kill switch; la
migración solo agrega índices y el rollback estructural se hace mediante corrección hacia adelante.
