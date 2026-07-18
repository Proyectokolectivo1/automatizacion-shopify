# Runbook — resumen operativo

Actualizado: 2026-07-17

## Controles

- `OPERATIONAL_QUEUE_ENABLED=false`
- `OPERATIONAL_QUEUE_KILL_SWITCH=true`

El resumen y la cola se habilitan juntos porque comparten read model y permiso. No abrir el kill
switch para eludir un incidente de aislamiento o costo.

## Diagnóstico

- `400`: comprobar presencia de `from`/`to`, offset ISO, `from < to`, máximo 31 días y filtros.
- `401`/`403`: renovar sesión o comprobar organización y rol owner/admin/operations.
- `503`: revisar los controles compartidos de la cola.
- Conteo cero: comprobar ventana exclusiva en `to`, tienda y tipo antes de ampliar el rango.
- Diferencia con la cola: comparar exactamente la misma ventana/filtros y la atención v1; no sumar
  páginas parciales ni reinterpretar estados.

La métrica es `ecommerce_api_operational_queue_operations_total{action="summary",outcome}` y la
auditoría exitosa usa `operations.summary.viewed`. Ninguna contiene PII ni IDs de tienda.

## Verificación

Ejecutar `pnpm operations:verify`, `pnpm database:verify`, `pnpm validate` y la regresión funcional en
serie. Un rollback operativo activa el kill switch; E6-H2A no añade tablas ni migraciones.
