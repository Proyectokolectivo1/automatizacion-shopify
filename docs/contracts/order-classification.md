# Contrato de clasificación de pedido

## Política v1

```json
{
  "schemaVersion": 1,
  "rules": [
    {
      "id": "prepaid-paid",
      "priority": 100,
      "paymentMode": "prepaid",
      "financialStatuses": ["paid"]
    }
  ]
}
```

Cada regla exige al menos un selector. Los selectores presentes se combinan con AND; los valores de
`tagsAny` y `gatewayNamesAny` usan OR dentro de su dimensión. Tokens se normalizan a minúsculas. IDs
de reglas son únicos y la prioridad está acotada entre 0 y 10.000.

## Decisión y errores

- `PREPAID` termina en `READY_FOR_LOGISTICS`.
- `COD` termina en `PENDING_TRANSPORT_PAYMENT`.
- Errores acotados: `INVALID_POLICY`, `INVALID_SNAPSHOT`, `NO_MATCH`, `AMBIGUOUS_MATCH`.
- Ningún error parcial modifica pedido, historial u outbox.

La configuración activa es única por tienda. La activación exige timestamp y toda versión es
positiva. Cambios futuros se entregarán como una nueva versión, no reescribiendo históricos.
Cada transición conserva actor de sistema, permiso, correlation ID y causation ID del evento.
