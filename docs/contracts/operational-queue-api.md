# Contrato API — cola operativa v1

Actualizado: 2026-07-17

## Endpoint

`GET /operations/organizations/:organizationId/queue`

Requiere sesión válida, coincidencia de organización y permiso `operations.queue.read`. Solo
`owner`, `admin` y `operations` lo reciben. La respuesta usa `Cache-Control: no-store`.

## Query

| Campo               | Regla                                                               |
| ------------------- | ------------------------------------------------------------------- |
| `limit`             | entero 1..100; predeterminado 20                                    |
| `cursor`            | cursor opaco devuelto por la página anterior; máximo 512 caracteres |
| `type`              | uno de los cinco tipos contractuales                                |
| `status`            | estado durable enumerado                                            |
| `storeId`           | UUID interno de tienda                                              |
| `requiresAttention` | `true` o `false`; predeterminado `true`                             |
| `from`, `to`        | ISO-8601 con offset; rango inclusivo y `from <= to`                 |

Los campos desconocidos, cursores inválidos, UUID inválidos y rangos invertidos responden `400`.

Tipos v1: `order`, `shopify_reconciliation_issue`, `payment_intent`,
`wompi_reconciliation_issue` y `whatsapp_conversation`.

## Respuesta

```json
{
  "contractVersion": "v1",
  "items": [
    {
      "attentionReason": "payment_intent_error",
      "itemId": "00000000-0000-4000-8000-000000000000",
      "occurredAt": "2026-07-17T12:00:00.000Z",
      "relatedResource": {
        "id": "00000000-0000-4000-8000-000000000001",
        "type": "order"
      },
      "requiresAttention": true,
      "status": "error",
      "storeId": "00000000-0000-4000-8000-000000000002",
      "type": "payment_intent"
    }
  ],
  "nextCursor": null
}
```

`nextCursor` es `null` cuando no hay otra página. El cliente debe tratarlo como opaco. La respuesta
no contiene teléfono, email, nombre, dirección, texto, payload, credenciales ni IDs externos.

## Disponibilidad

La ruta responde `503` salvo que `OPERATIONAL_QUEUE_ENABLED=true` y
`OPERATIONAL_QUEUE_KILL_SWITCH=false`. No existen mutaciones en este contrato.
