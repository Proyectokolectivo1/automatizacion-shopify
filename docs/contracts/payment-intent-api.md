# Contrato API de intención de pago v1

`POST /operations/organizations/:organizationId/payments/orders/:orderId/intents`

Requiere Bearer token, tenant coincidente, permiso `payment-intents.create` para owner/admin/operations
y `Idempotency-Key` de 8 a 200 caracteres. No acepta monto, moneda, referencia ni expiración del
cliente: todos se derivan de datos durables y configuración validada.

Respuesta 201:

```json
{
  "intentId": "uuid",
  "orderId": "uuid",
  "provider": "wompi",
  "externalReference": "cod-uuid-1",
  "checkoutUrl": "https://checkout.wompi.simulated.invalid/p/?...",
  "amountMinor": 1200000,
  "currency": "COP",
  "status": "pending",
  "attemptNumber": 1,
  "expiresAt": "2026-07-15T12:00:00.000Z",
  "outcome": "created",
  "mode": "simulation"
}
```

La misma clave retorna exactamente el snapshot original. Una clave nueva para una intención vigente
retorna `outcome=replayed` sin duplicar filas ni outbox. Pedidos no COD, sin tarifa resuelta, con otra
moneda o con una intención vencida fallan cerrados. La respuesta usa `Cache-Control: no-store`.
