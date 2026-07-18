# Runbook de tarifas de transporte

## Habilitación local controlada

1. Mantenga modo simulación activo y confirme que no hay credenciales ni tráfico externo.
2. Configure `TRANSPORT_RATES_ENABLED=true`, `TRANSPORT_RATES_KILL_SWITCH=false` y
   `TRANSPORT_RATES_SIMULATION_MODE=true`.
3. Ejecute `pnpm database:migrate` y `pnpm transport-rates:verify`.
4. Cree un borrador, previsualice pedidos representativos y obtenga aprobación comercial humana.
5. Active la versión aprobada y observe `ecommerce_api_transport_rate_operations_total`.

## Incidentes

- Tarifa ausente o ambigua: active el kill switch, no modifique decisiones históricas, cree una nueva
  versión y valide con `preview`.
- Importe incorrecto ya resuelto: preserve decisión/auditoría, bloquee procesamiento posterior y
  escale a operación; no edite SQL manualmente.
- Duplicados sospechados: compare decisiones, claves idempotentes hasheadas y eventos outbox. Un
  replay válido no crea filas adicionales.
- Drift de esquema: detenga el despliegue y ejecute `pnpm database:verify`; corrija hacia adelante.

Rollback operativo: `TRANSPORT_RATES_KILL_SWITCH=true`. La migración es expand-only y no se revierte
eliminando tablas en un entorno compartido.
