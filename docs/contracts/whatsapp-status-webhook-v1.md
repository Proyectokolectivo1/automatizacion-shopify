# Contrato v1 — webhook de estados WhatsApp simulado

## Alcance

Este contrato recibe únicamente el fixture sintético v1. Los nombres `sent`, `delivered`, `read` y
`failed` se tomaron del vocabulario público de la colección oficial de Meta; el sobre y la
autenticación de este contrato son deliberadamente sintéticos. No acepta ni afirma entregas Meta.

Referencia oficial consultada: [Webhook Payload Reference de Meta](https://www.postman.com/meta/whatsapp-business-platform/folder/tduohwq/webhook-payload-reference).

## Configuración protegida

`PATCH /integrations/organizations/:organizationId/whatsapp/stores/:storeId/webhook-secret`

- Requiere sesión, permiso `integration.manage` e `Idempotency-Key`.
- Cuerpo estricto: `{ "webhookSecret": "mínimo 32 caracteres" }`.
- El secreto se cifra con AES-256-GCM y AAD tenant/tienda/propósito distinto al token de envío.

## Ingreso

`POST /webhooks/whatsapp/:storeId/statuses`

- `Content-Type: application/json`.
- Header `x-simulated-whatsapp-signature-v1: sha256=<hex HMAC-SHA256>`.
- El HMAC se calcula sobre los bytes exactos usando el secreto webhook sintético.
- Tamaño máximo configurable, 256 KiB por defecto.
- Solo opera con conexión WhatsApp activa/saludable y controles de simulación habilitados.

```json
{
  "_fixture": { "synthetic": true, "version": "v1" },
  "eventType": "message.status",
  "externalEventId": "synthetic-status-event-v1",
  "occurredAt": "2026-07-14T20:00:00.000Z",
  "providerMessageId": "simulated:<64 hex>",
  "status": "sent"
}
```

El cuerpo se autentica antes de parsearlo. La base nunca conserva el cuerpo ni el identificador de
mensaje externo en claro: persiste SHA-256, resumen acotado y la referencia interna cuando existe.

## Respuesta 202

Incluye `eventId`, `messageId` interno o `null`, `observedStatus`, `mode=simulation`, `duplicate` y
uno de estos resultados:

- `applied`;
- `ignored_duplicate_status`;
- `ignored_out_of_order`;
- `ignored_terminal_state`;
- `ignored_unknown_message`.

Reusar `externalEventId` con otro cuerpo responde 409. Firma inválida responde 401; target no
disponible, 404; controles cerrados, 503.
