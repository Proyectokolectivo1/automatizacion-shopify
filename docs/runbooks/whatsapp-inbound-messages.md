# Runbook — mensajes entrantes WhatsApp simulados

## Controles

Mantenga por defecto:

```text
WHATSAPP_INBOUND_ENABLED=false
WHATSAPP_INBOUND_KILL_SWITCH=true
WHATSAPP_INBOUND_SIMULATION_MODE=true
WHATSAPP_INBOUND_CONTENT_RETENTION_DAYS=30
```

Una prueba local requiere además integración y webhooks simulados habilitados, ambos kill switches
abiertos, conexión activa/saludable y secreto webhook configurado por la API protegida.

## Diagnóstico

- 400: JSON/fixture no estricto, texto inválido o intento de enviar un payload no sintético.
- 401: firma ausente o incorrecta; verifique los bytes exactos y el secreto de la tienda.
- 404: target no activo/saludable o tenant ajeno; no haga búsquedas reveladoras.
- 409: evento o mensaje externo reutilizado con contenido diferente; preserve evidencia y escale.
- 413: se superó `WHATSAPP_WEBHOOKS_MAX_BODY_BYTES`.
- 503: algún flag, modo o kill switch cerró el ingreso, o el keyring no permite cifrar.

Observe `ecommerce_api_whatsapp_inbound_webhooks_total{outcome}` y el outbox
`whatsapp.message.simulated-received.v1`. No consulte texto cifrado fuera de una operación autorizada
y nunca edite eventos/mensajes en SQL. Para validar ejecute `pnpm whatsapp:verify`,
`pnpm database:verify` y `pnpm validate`.

Ante una exposición active el kill switch, rote el secreto webhook y evalúe el keyring sin eliminar
la versión necesaria para descifrar evidencia existente. Este runbook no autoriza tráfico Meta real.
