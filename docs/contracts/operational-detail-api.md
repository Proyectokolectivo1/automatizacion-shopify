# Contrato de detalle operativo E6-H6A

`GET /operations/organizations/:organizationId/items/:type/:itemId` requiere
`operations.detail.read`, responde `Cache-Control: no-store` y usa UUID interno solo entre BFF/API.

La respuesta `v1` contiene estado compartido (`type`, `status`, `occurredAt`, `requiresAttention`,
`attentionReason`), `details` discriminado y `timeline` máximo 25. Campos por tipo:

- `order`: moneda, modo de pago, importes operativos en unidades menores y versión.
- `payment_intent`: monto, moneda, intento y vencimiento.
- `shopify_reconciliation_issue`: tipo, conteo y fechas de detección/reproceso/resolución.
- `wompi_reconciliation_issue`: tipo, conteo, estados comparados y fechas seguras.
- `whatsapp_conversation`: indicador/versión de asignación y fecha del último mensaje.

No incluye UUID, tienda, cliente, dirección, teléfono, correo, producto, cuerpo, snapshot, metadata,
evidencia, actor, URL, referencia externa ni payload. Recurso inexistente devuelve `404` uniforme.

La ruta BFF `GET /api/operations/detail?reference=...` acepta únicamente la referencia cifrada y
devuelve la misma proyección ya validada, sin la referencia ni identificadores.
