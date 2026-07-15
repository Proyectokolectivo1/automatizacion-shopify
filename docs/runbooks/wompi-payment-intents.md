# Runbook de intenciones Wompi simuladas

## Habilitación local

1. Confirme `WOMPI_SIMULATION_MODE=true` y que no existen llaves reales en el entorno.
2. Configure `WOMPI_ENABLED=true`, `WOMPI_KILL_SWITCH=false` y TTL entre 15 y 1440 minutos.
3. Ejecute `pnpm database:migrate` y `pnpm wompi:verify`.
4. Use solo pedidos sintéticos COD con tarifa resuelta.
5. Verifique que todo `checkoutUrl` termine en `.invalid` antes de compartirlo.

## Incidentes

- Host distinto de `.invalid`: active inmediatamente el kill switch y trate el evento como posible
  conexión no autorizada.
- Monto/referencia/firma discordantes: no edite SQL; bloquee la operación y reproduzca el contrato.
- Intención vencida: E2-H5 aún no está implementada; mantenga el pedido bloqueado y no cree reintentos
  manuales.
- Duplicado: compare intención, idempotencia y `payment.intent.created.v1`; debe existir una sola fila.

Rollback operativo: `WOMPI_KILL_SWITCH=true`. La migración es expand-only y se corrige hacia adelante.
