# Contrato de eventos de conciliación Wompi

Actualizado: 2026-07-14

## `payment.reconciliation.differences-detected.v1`

Se emite una vez por reporte exitoso que contiene al menos una diferencia.

Campos:

- `reconciliationRunId`, `storeId`: UUID internos.
- `provider`: siempre `wompi` en esta versión.
- `mode`: siempre `simulation`.
- `windowStartedAt`, `windowEndedAt`: ventana UTC ISO-8601.
- `scannedCount`, `differenceCount`, `newIssueCount`, `resolvedCount`: enteros no negativos.
- `countsByType`: conteos acotados para `intent_status_mismatch`, `event_status_mismatch`,
  `missing_accepted_event` y `transaction_data_mismatch`.

No contiene referencia Wompi, transaction ID, URL de checkout, firma, contacto o datos del pedido.
`aggregateType=payment_reconciliation_run` y `aggregateId=reconciliationRunId` permiten entrega
idempotente. El evento es una alerta; ningún consumidor debe interpretarlo como autorización para
corregir pagos automáticamente.
