# ADR-002: ingreso seguro de webhooks Shopify

- Estado: aceptada
- Fecha: 2026-07-14
- Alcance: E1-H2A

## Contexto

Shopify firma entregas HTTPS con HMAC-SHA256 sobre el cuerpo crudo y proporciona un identificador de
entrega para deduplicar. La plataforma debe responder rápido, persistir antes de usar Redis y no
presentar fixtures como pedidos reales.

## Decisión

Se usa un endpoint por tienda y topic permitido. El pipeline instala correlación antes de un parser
binario exclusivo para `/webhooks/shopify`; el servicio verifica HMAC en tiempo constante y solo
después interpreta JSON. Durante E1-H2A únicamente se acepta `orders/create` con fixture sintético v1.

El secreto se cifra por tienda con AES-256-GCM, keyring versionado y AAD
`shopify:{organizationId}:{storeId}:webhook-secret`. Una restricción única
`(store_id, event_type, external_event_id)` decide idempotencia. Webhook y outbox se escriben en una
transacción PostgreSQL; BullMQ procesa después y actualiza el estado del webhook.

No se aplica una ventana temporal que descarte entregas antiguas: `X-Shopify-Triggered-At` se valida y
persiste, pero la tolerancia a webhooks tardíos prevalece. La máquina de estados posterior decidirá si
un evento puede cambiar negocio.

## Consecuencias

- Redis caído no impide aceptar una entrega ya autenticada.
- Un replay idéntico devuelve éxito sin otro outbox; el mismo ID con bytes distintos devuelve 409.
- El payload completo no se persiste en claro en esta vertical; quedan hash y resumen sintético.
- Suscripción remota, pedido normalizado y Shopify real siguen bloqueados por credenciales.
- Rollback operativo: activar `SHOPIFY_WEBHOOKS_KILL_SWITCH`; la migración se corrige hacia adelante.

## Fuentes

- [Verify webhook deliveries](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)
- [Webhooks delivery structure](https://shopify.dev/docs/apps/build/webhooks/delivery-structure)
