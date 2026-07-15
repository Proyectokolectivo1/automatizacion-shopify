# Contrato de webhook Wompi simulado

`POST /webhooks/wompi/transactions` responde `200` solo para un fixture sintético válido y persistido. El cuerpo debe contener `transaction.updated`, `data.transaction`, `timestamp`, `sent_at` y `signature.{checksum,properties}`. Respuesta: `accepted`, `duplicate`, `eventId`, `intentId`, `mode` y `status`.

- `400`: JSON/fixture inválido.
- `401`: checksum o antigüedad inválidos.
- `404`: transacción sin intención local.
- `409`: colisión o divergencia frente a la consulta authoritative.
- `503`: controles apagados o proveedor no disponible.

No hay autenticación de usuario: la autenticidad depende del checksum y del secreto de eventos.
