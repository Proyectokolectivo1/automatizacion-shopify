# Contrato API de webhooks Shopify v1

Estado: simulación. Suscripción real: `BLOQUEADO_POR_CREDENCIALES`.

## Configurar secreto sintético

`PATCH /integrations/organizations/:organizationId/shopify/stores/:storeId/webhook-secret`

- Autenticación Bearer y permiso `integration.manage`.
- Header obligatorio `Idempotency-Key`, 8-200 caracteres.
- Body: `{ "webhookSecret": "..." }`, 32-512 caracteres.
- El secreto se cifra; nunca aparece en respuesta, logs o auditoría.

## Recibir orders/create

`POST /webhooks/shopify/:storeId/orders-create`

Headers obligatorios, tratados sin sensibilidad a mayúsculas:

- `X-Shopify-Topic: orders/create`
- `X-Shopify-Hmac-Sha256`
- `X-Shopify-Shop-Domain`
- `X-Shopify-API-Version`
- `X-Shopify-Webhook-Id`
- `X-Shopify-Triggered-At`

Body máximo: 262.144 bytes por defecto. En simulación debe ser JSON con:

```json
{
  "_fixture": { "synthetic": true, "version": "v1" },
  "id": 1000000000001,
  "test": true
}
```

Respuesta 202 para entrega nueva o duplicada idéntica:

```json
{
  "accepted": true,
  "duplicate": false,
  "eventId": "uuid",
  "mode": "simulation"
}
```

Errores relevantes:

- 400: headers/topic/timestamp/JSON/fixture inválidos.
- 401: firma o dominio inválidos.
- 404: tienda/conexión/secreto no disponibles o inactivos.
- 409: mismo ID de entrega reutilizado con otro cuerpo.
- 413: cuerpo superior al límite.
- 503: flag apagado, kill switch activo o modo no simulado.

Todos incluyen `x-correlation-id`. El cliente puede reintentar respuestas no 2xx; los 202 son
idempotentes por almacenamiento durable.
