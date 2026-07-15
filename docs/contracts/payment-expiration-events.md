# Contrato de eventos de vencimiento

Todos los eventos son versión 1, tenant-safe, sin PII, URL de checkout, referencias externas ni
secretos.

## `payment.intent.expired.v1`

Agregado `payment_intent`. Se crea atómicamente con `status=EXPIRED`, `expiredAt`, la cancelación de
recordatorios pendientes y el historial del pedido. Payload:

- `paymentIntentId`, `orderId`, `storeId`;
- `expiredAt` UTC;
- `abandonmentAction`: `mark` o `cancel`;
- `remindersCancelled`;
- `mode=simulation`.

## `shopify.order.abandonment-action.requested.v1`

Agregado `order`. Expresa una solicitud futura `mark`/`cancel`; no afirma que Shopify haya cambiado.
En E2-H5A no existe consumidor externo y `mode` siempre es `simulation`.

## `payment.intent.late-status-observed.v1`

Registra un estado authoritative tardío distinto del estado terminal persistido. Incluye estado
actual/observado, IDs internos, `manualReview` y timestamp. Nunca permite retroceder o sobrescribir
silenciosamente la intención.

La entrega de outbox es al menos una vez; los consumidores futuros deben usar el ID de evento como
clave idempotente.
