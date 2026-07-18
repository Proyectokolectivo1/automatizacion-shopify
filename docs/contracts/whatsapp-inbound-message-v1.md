# Contrato v1 — mensaje entrante WhatsApp simulado

## Alcance

Este contrato acepta únicamente el fixture sintético v1. El vocabulario `from`, `id`, `timestamp`,
`type=text` y `text.body` de un mensaje recibido se contrastó con el ejemplo público oficial de Meta;
el sobre, los nombres y la autenticación de esta API son deliberadamente sintéticos. No acepta un
payload Meta ni demuestra que exista una aplicación o un número conectados.

Referencia oficial consultada: [Received Text Message de Meta](https://www.postman.com/meta/whatsapp-business-platform/request/cy6hnq7/received-text-message).

## Ingreso

`POST /webhooks/whatsapp/:storeId/messages`

- `Content-Type: application/json`.
- Header `x-simulated-whatsapp-signature-v1: sha256=<hex HMAC-SHA256>`.
- HMAC sobre los bytes exactos con el secreto webhook sintético cifrado de la tienda.
- Máximo 256 KiB, compartido con el ingreso sintético de estados.
- Requiere conexión WhatsApp activa/saludable y todos los controles de simulación abiertos.

```json
{
  "_fixture": { "synthetic": true, "version": "v1" },
  "eventType": "message.received",
  "externalEventId": "synthetic-inbound-event-v1",
  "occurredAt": "2026-07-15T20:00:00.000Z",
  "providerMessageId": "simulated:<64 hex>",
  "senderPhoneE164": "+573001112233",
  "message": { "type": "text", "text": "Mensaje exclusivamente sintético" }
}
```

El esquema es estricto: no admite campos extra, texto vacío, teléfono fuera de E.164 ni IDs que no
usen el prefijo `simulated:`. Se autentica antes de parsear.

## Persistencia y respuesta

El texto se cifra con AES-256-GCM y AAD organización/tienda/mensaje; nunca se guarda en `body`. El
teléfono solo queda en la conversación si corresponde a un cliente ya conocido en la misma tienda.
Un contacto desconocido se representa por HMAC tenant-safe y no conserva el teléfono. Eventos,
outbox, auditoría y métricas reciben únicamente hashes, IDs internos y resúmenes acotados.

La respuesta 202 contiene `eventId`, `messageId`, `conversationId`, `duplicate`,
`status=simulated_received` y `mode=simulation`. Reusar el evento con otro cuerpo o el mensaje externo
con otro contenido responde 409; firma inválida, 401; target no disponible, 404; controles cerrados, 503.
