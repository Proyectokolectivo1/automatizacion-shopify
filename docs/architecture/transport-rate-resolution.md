# Resolución de tarifas de transporte

E2-H1A introduce políticas de tarifa versionadas para pedidos contraentrega en COP. Una política
pertenece a una organización y puede ser global o específica de una tienda. Los borradores son
inmutables; activar una versión desactiva atómicamente la versión activa del mismo alcance.

El resolvedor es puro y determinista. Filtra reglas por vigencia semiabierta `[validFrom, validTo)`,
ciudad, departamento y productos Shopify del pedido. Ordena por:

1. mayor prioridad explícita;
2. mayor número de selectores coincidentes;
3. alcance de tienda sobre alcance global;
4. `ruleKey` e identificador, solo como desempate estable.

Si dos reglas con el mismo rango producen importes distintos, o ninguna coincide, la operación falla
cerrada. Las ubicaciones se normalizan con Unicode NFKC, espacios canónicos y locale `es-CO`.

`preview` no muta datos. `resolve` persiste una decisión inmutable, actualiza
`orders.transport_charge_amount` y agrega `order.transport_rate.resolved.v1` al outbox en una sola
transacción serializable. El hash de la clave idempotente evita guardar el valor recibido.

Los tres controles están cerrados por defecto:

- `TRANSPORT_RATES_ENABLED=false`
- `TRANSPORT_RATES_KILL_SWITCH=true`
- `TRANSPORT_RATES_SIMULATION_MODE=true`

La vertical no crea pagos, mensajes, guías ni tráfico externo.
