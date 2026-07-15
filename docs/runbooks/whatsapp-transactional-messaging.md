# Runbook — mensajería WhatsApp simulada

## Habilitación local

Configure `WHATSAPP_MESSAGES_ENABLED=true`, `WHATSAPP_MESSAGES_KILL_SWITCH=false` y
`WHATSAPP_MESSAGES_SIMULATION_MODE=true`. Deben existir una conexión activa/saludable, un pedido con
cliente elegible y una plantilla simulada activa del evento e idioma solicitados.

## Operación

1. Envíe la solicitud con una clave idempotente estable para el intento HTTP.
2. Considere `simulated_accepted` únicamente como aceptación del fixture local.
3. Ante duplicados, conserve evento/pedido/versión; cambiar variables para el mismo efecto devuelve 409.
4. Ante un incidente, active primero `WHATSAPP_MESSAGES_KILL_SWITCH=true` y reinicie el API.
5. No edite mensajes ni conversaciones directamente. Examine auditoría, outbox y la métrica
   `ecommerce_api_whatsapp_message_operations_total`.

Valide con `pnpm whatsapp:verify`, `pnpm database:verify` y `pnpm validate`. No desactive el modo
simulación y no configure credenciales Meta reales en esta fase.
