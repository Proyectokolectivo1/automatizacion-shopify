# Runbook de sincronización de pedidos Shopify

## Validación local

```bash
pnpm infra:up
pnpm database:migrate
pnpm shopify:webhooks:verify
pnpm shopify:orders:verify
pnpm database:status
```

Las suites crean bases temporales, usan colas aisladas y eliminan sus recursos. No requieren ni
aceptan credenciales Shopify reales.

## Activación controlada de simulación

Requiere también la integración Shopify, webhooks y outbox habilitados en simulación. Configure en
un `.env` local ignorado:

```dotenv
SHOPIFY_ORDER_SYNC_ENABLED=true
SHOPIFY_ORDER_SYNC_KILL_SWITCH=false
SHOPIFY_ORDER_SYNC_SIMULATION_MODE=true
```

No cambie `SIMULATION_MODE` a `false`: aún no existe adaptador real.

## Diagnóstico

1. Localice el webhook por correlation ID y confirme `signature_valid=true`.
2. Revise `job_executions`, `outbox_events` y el estado del webhook, sin extraer payloads.
3. Consulte la métrica `ecommerce_api_shopify_order_sync_total` por resultado.
4. Verifique conexión/tienda activas, `provider_resource_id` y versión del fixture.
5. Si agotó intentos, use el runbook de DLQ; corrija la causa antes de reprocesar.

## Kill switch

Establezca `SHOPIFY_ORDER_SYNC_KILL_SWITCH=true` y reinicie el worker. Los webhooks pueden seguir
persistiéndose de forma rápida, pero la sincronización fallará cerrada mientras el consumidor siga
recibiendo trabajos; para una pausa completa cierre también publisher/worker según su runbook.
