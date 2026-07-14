# Runbook de reconciliación Shopify

## Estado seguro por defecto

```dotenv
SHOPIFY_RECONCILIATION_ENABLED=false
SHOPIFY_RECONCILIATION_KILL_SWITCH=true
SHOPIFY_RECONCILIATION_SIMULATION_MODE=true
SHOPIFY_RECONCILIATION_MAX_WINDOW_HOURS=24
SHOPIFY_RECONCILIATION_STUCK_AFTER_MINUTES=15
```

No habilite el servicio fuera de una prueba controlada. El modo no simulado no tiene adaptador real
y falla cerrado.

## Prueba local

1. Confirme que PostgreSQL y Redis locales estén sanos con `pnpm infra:verify`.
2. Aplique migraciones con `pnpm database:migrate`.
3. Ejecute `pnpm shopify:reconciliation:verify` para la prueba aislada y reproducible.
4. Para inspección manual, habilite temporalmente el flag y desactive el kill switch solo en el
   proceso local. Use una ventana corta y una tienda simulada activa.
5. Consulte incidencias abiertas antes de reprocesar una sola con una clave idempotente nueva.
6. Restaure inmediatamente los valores seguros.

## Diagnóstico

- `MISSING_ORDER`: existe en el listado simulado, pero no en `orders` para esa tienda.
- `FAILED_WEBHOOK`: el webhook llegó a estado `FAILED` o `DEAD_LETTER`.
- `STUCK_ORDER`: el pedido sigue `RECEIVED` más allá del umbral configurado.

Observe el contador `ecommerce_api_shopify_reconciliations_total` por resultado y los audit logs
`shopify.reconciliation.*`. No edite estados SQL manualmente: el reproceso debe pasar por la API y
el outbox.

## Kill switch y recuperación

Ante una ventana incorrecta, señales excesivas o comportamiento inesperado, active
`SHOPIFY_RECONCILIATION_KILL_SWITCH=true` y reinicie el proceso. Los checkpoints e incidencias son
durables; no borre filas. Corrija hacia adelante y reanude con una ventana pequeña.
