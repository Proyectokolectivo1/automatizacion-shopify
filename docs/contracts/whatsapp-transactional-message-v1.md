# Contrato v1 — mensaje transaccional WhatsApp simulado

Este contrato acepta únicamente una entrega local simulada. `simulated_accepted` significa que el
adaptador determinista aceptó el fixture; no significa enviado, entregado ni leído por Meta.

## Endpoint

`POST /integrations/organizations/:organizationId/whatsapp/stores/:storeId/messages/transactional`

Requiere sesión, permiso `whatsapp-messages.dispatch` e `Idempotency-Key` de 8 a 200 caracteres. El
cuerpo es estricto:

```json
{
  "eventType": "order.confirmed",
  "languageCode": "es_CO",
  "orderId": "00000000-0000-4000-8000-000000000000",
  "variables": {
    "customer_name": { "type": "TEXT", "value": "Cliente sintético" },
    "amount": { "type": "CURRENCY", "currency": "COP", "amountMinor": 125000 }
  }
}
```

Los valores admitidos son `TEXT`, `URL` HTTPS, `DATE` ISO `YYYY-MM-DD` y `CURRENCY` con importe
entero en unidad menor. Deben coincidir exactamente con el esquema de la plantilla activa.

La respuesta HTTP 202 contiene identificadores, plantilla y estado simulado. Nunca devuelve teléfono,
cuerpo renderizado, token ni variables. Repetir la misma clave y solicitud devuelve la misma respuesta;
reutilizarla con otro contenido produce 409. El mismo evento, pedido y versión de plantilla solo puede
crear un efecto de negocio, incluso con otra clave HTTP.

## Precondiciones y evento

Se exige conexión WhatsApp activa/saludable, pedido del tenant, cliente con consentimiento y teléfono
E.164, y plantilla `simulated_approved` activa para evento/idioma. El evento durable es
`whatsapp.message.simulated-accepted.v1`; su payload omite teléfono, cuerpo y variables.

## Referencia oficial

El límite futuro sigue la forma pública de Meta `POST /{Phone-Number-ID}/messages`, `type=template` y
respuesta con identificador de mensaje. E3-H3A no ejecuta esa operación:
<https://www.postman.com/meta/whatsapp-business-platform/request/o65u5m5/send-message-template-text>.
