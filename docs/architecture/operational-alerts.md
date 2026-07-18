# Alertas operativas internas E6-H4A

## Objetivo

E6-H4A convierte la política compartida de atención v1 en alertas internas durables. No introduce
SLA, severidad, notificaciones, exportación ni autocorrección de recursos.

## Flujo

1. El scheduler selecciona como máximo `OPERATIONAL_ALERTS_BATCH_SIZE` organizaciones por ciclo.
2. El evaluador fija una ventana `[now-lookback, now)` y adquiere locks transaccionales por tenant
   en orden estable.
3. Una sola consulta reutiliza `operational-read-model.ts`, agrega los cinco tipos y ejecuta las
   transiciones `create`, `refresh` y `resolve` en PostgreSQL.
4. La API pública solo lee reglas o alertas ya materializadas.

El cursor in-memory del scheduler avanza por UUID y vuelve al inicio al agotar el lote. Nunca hay
una consulta por recurso ni por tipo. El lote usa una lectura agregada y una sentencia de transición.

## Estado durable

`operational_alerts` pertenece obligatoriamente a una organización. Cada fila representa un ciclo de
vida y conserva regla/version, tipo, conteo observado, ventana y tiempos de detección/evaluación.
Un índice parcial único admite como máximo una alerta `open` por `(organization, rule, version)`.

- atención presente sin alerta abierta: `create`;
- atención presente con alerta abierta: `refresh`;
- atención ausente con alerta abierta: `resolve`;
- atención ausente sin alerta abierta: no-op;
- atención que reaparece tras resolución: nuevo ciclo de vida.

Los constraints validan versión positiva, ventana, orden temporal, forma open/resolved y correspondencia
entre `rule_key` e `item_type`.

## Reglas v1

Las cinco reglas están declaradas en `operational-alert-rules.ts` y dependen exclusivamente de
`requires_attention` del read model compartido. Un cambio de condición exige una nueva versión; no se
edita retroactivamente el significado de una versión persistida.
