# Runbook de conciliación Wompi simulada

Actualizado: 2026-07-14

## Activación local controlada

1. Mantenga `WOMPI_SIMULATION_MODE=true` y `WOMPI_KILL_SWITCH=false`.
2. Configure `WOMPI_RECONCILIATION_ENABLED=true`,
   `WOMPI_RECONCILIATION_KILL_SWITCH=false` y
   `WOMPI_RECONCILIATION_SIMULATION_MODE=true`.
3. Ajuste intervalo, lookback, poll y batch únicamente dentro de los límites validados.
4. Ejecute `pnpm wompi:verify` antes de iniciar la API.

## Diagnóstico

- Revise `payment_reconciliation_runs` para estado, ventana y reporte agregado.
- Revise `payment_reconciliation_issues` por tenant, estado y tipo; no edite filas manualmente.
- `provider_unavailable` no avanza la ventana y aumenta `consecutive_failures`.
- Compruebe `ecommerce_api_wompi_reconciliations_total` y el outbox
  `payment.reconciliation.differences-detected.v1`.

## Contención

Active `WOMPI_RECONCILIATION_KILL_SWITCH=true`. Esto detiene nuevas ejecuciones sin borrar
checkpoints, reportes o incidencias. No cambie estados de pago para “cuadrar” una diferencia.

## Recuperación

Restablezca el proveedor simulado, valide `pnpm wompi:verify`, quite el kill switch y permita el
reintento programado. Confirme que el siguiente reporte sea `COMPLETED`, que el checkpoint avance y
que `consecutiveFailures` vuelva a cero.
